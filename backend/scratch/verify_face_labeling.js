import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { labelFace } from "../src/services/faceLabeling.service.js";
import Person from "../src/models/Person.js";
import Face from "../src/models/Face.js";
import Photo from "../src/models/Photo.js";

const makeVector = (size, val = 0.0) => Array(size).fill(val);

async function main() {
  console.log("=== STARTING FACE LABELING SERVICE VERIFICATION ===");

  // 1. Establish database connection
  await connectDB();

  // Define ObjectIDs
  const testUserId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a10");
  const alternateUserId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a99");
  const testPhotoId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d01");

  try {
    // Clean up any existing records
    await Face.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });
    await Person.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });
    await Photo.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });

    // Seed mock Photo records
    const photo = new Photo({
      _id: testPhotoId,
      userId: testUserId,
      url: "https://example.com/photo.jpg",
      cloudinaryPublicId: "drishyamitra/photos/photo",
      width: 800,
      height: 600,
      status: "completed"
    });
    await photo.save();

    // Seed mock Face records (all unknown initially)
    const testFaceEmbedding = makeVector(512, 0.01);
    const testFaceBbox = { x: 10, y: 10, w: 50, h: 50 };

    const face1 = new Face({
      photoId: testPhotoId,
      personId: null,
      userId: testUserId,
      embedding: testFaceEmbedding,
      bbox: testFaceBbox,
      isLabeled: false
    });
    await face1.save();

    const face2 = new Face({
      photoId: testPhotoId,
      personId: null,
      userId: testUserId,
      embedding: testFaceEmbedding,
      bbox: testFaceBbox,
      isLabeled: false
    });
    await face2.save();

    const face3 = new Face({
      photoId: testPhotoId,
      personId: null,
      userId: testUserId,
      embedding: testFaceEmbedding,
      bbox: testFaceBbox,
      isLabeled: false
    });
    await face3.save();

    const faceAlternate = new Face({
      photoId: testPhotoId,
      personId: null,
      userId: alternateUserId, // owned by someone else
      embedding: testFaceEmbedding,
      bbox: testFaceBbox,
      isLabeled: false
    });
    await faceAlternate.save();

    // --- TEST 1: Label Unknown Face with New Name ---
    console.log("\n[TEST 1] Testing labelFace() with new name...");
    const res1 = await labelFace(face1._id, testUserId, "Dad");
    console.log("Result 1:", res1);
    if (!res1.success || !res1.createdPerson || res1.personName !== "Dad") {
      throw new Error("TEST 1 FAILED: Expected new Person created");
    }

    // Verify Face updated and Person exists
    const updatedFace1 = await Face.findById(face1._id);
    if (!updatedFace1.isLabeled || !updatedFace1.personId) {
      throw new Error("TEST 1 FAILED: Expected face1 to be updated in database");
    }
    const createdPerson1 = await Person.findById(res1.personId);
    if (!createdPerson1 || createdPerson1.name !== "Dad" || createdPerson1.nameNormalized !== "dad") {
      throw new Error("TEST 1 FAILED: Expected person to exist in database with normalized name");
    }
    console.log("[TEST 1] PASSED.");

    // --- TEST 2: Label Second Face with Existing Name ---
    console.log("\n[TEST 2] Testing labelFace() with existing name (reuse check)...");
    const res2 = await labelFace(face2._id, testUserId, "Dad");
    console.log("Result 2:", res2);
    if (!res2.success || res2.createdPerson || res2.personName !== "Dad") {
      throw new Error("TEST 2 FAILED: Expected existing Person reused");
    }
    if (res2.personId.toString() !== res1.personId.toString()) {
      throw new Error("TEST 2 FAILED: Person ID mismatch");
    }

    const peopleCount2 = await Person.countDocuments({ userId: testUserId });
    if (peopleCount2 !== 1) {
      throw new Error(`TEST 2 FAILED: Duplicate Person record created. Count: ${peopleCount2}`);
    }
    console.log("[TEST 2] PASSED.");

    // --- TEST 3: Mixed Case Name Normalization ---
    console.log("\n[TEST 3] Testing mixed case normalization reuse...");
    const res3 = await labelFace(face3._id, testUserId, "dAd");
    console.log("Result 3:", res3);
    if (!res3.success || res3.createdPerson || res3.personName !== "Dad") {
      throw new Error("TEST 3 FAILED: Expected existing Person reused despite mixed case");
    }
    if (res3.personId.toString() !== res1.personId.toString()) {
      throw new Error("TEST 3 FAILED: Person ID mismatch");
    }

    const peopleCount3 = await Person.countDocuments({ userId: testUserId });
    if (peopleCount3 !== 1) {
      throw new Error("TEST 3 FAILED: Expected exactly 1 person document");
    }
    console.log("[TEST 3] PASSED.");

    // --- TEST 4: Attempt to Relabel Face ---
    console.log("\n[TEST 4] Testing relabeling prevention...");
    let test4Caught = false;
    try {
      await labelFace(face1._id, testUserId, "Uncle");
    } catch (err) {
      test4Caught = true;
      console.log("Caught expected error:", err.message);
      if (err.message !== "Face already labeled") {
        throw new Error(`TEST 4 FAILED: Unexpected error message: ${err.message}`);
      }
    }
    if (!test4Caught) {
      throw new Error("TEST 4 FAILED: Face allowed relabeling when it should be blocked");
    }
    console.log("[TEST 4] PASSED.");

    // --- TEST 5: Cross-User Ownership Validation ---
    console.log("\n[TEST 5] Testing ownership checks (cross-tenant access)...");
    let test5Caught = false;
    try {
      await labelFace(faceAlternate._id, testUserId, "Uncle"); // User tries to label alternate user's face
    } catch (err) {
      test5Caught = true;
      console.log("Caught expected error:", err.message);
      if (err.message !== "Access denied. You do not own this face.") {
        throw new Error(`TEST 5 FAILED: Unexpected error message: ${err.message}`);
      }
    }
    if (!test5Caught) {
      throw new Error("TEST 5 FAILED: Allowed cross-tenant labeling");
    }
    console.log("[TEST 5] PASSED.");

    // --- TEST 6: BBox and Embedding Integrity ---
    console.log("\n[TEST 6] Testing bounding box and embedding integrity...");
    const finalFace1 = await Face.findById(face1._id);
    if (finalFace1.photoId.toString() !== face1.photoId.toString()) {
      throw new Error("TEST 6 FAILED: photoId changed");
    }
    if (
      finalFace1.bbox.x !== face1.bbox.x || 
      finalFace1.bbox.y !== face1.bbox.y || 
      finalFace1.bbox.w !== face1.bbox.w || 
      finalFace1.bbox.h !== face1.bbox.h
    ) {
      throw new Error("TEST 6 FAILED: bbox parameters changed");
    }
    for (let i = 0; i < 512; i++) {
      if (finalFace1.embedding[i] !== face1.embedding[i]) {
        throw new Error("TEST 6 FAILED: embedding vectors changed");
      }
    }
    console.log("[TEST 6] PASSED.");

    // --- TEST 7: Input Name Validations ---
    console.log("\n[TEST 7] Testing input name validations...");
    
    // Seed an unknown face for validation tests
    const valFace = new Face({
      photoId: testPhotoId,
      personId: null,
      userId: testUserId,
      embedding: testFaceEmbedding,
      bbox: testFaceBbox,
      isLabeled: false
    });
    await valFace.save();

    // Validation checks array
    const testInputs = [
      { name: "", error: "empty or whitespace" },
      { name: "   ", error: "empty or whitespace" },
      { name: 1234, error: "must be a string" },
      { name: ["Dad"], error: "must be a string" },
      { name: "a".repeat(101), error: "cannot exceed 100 characters" }
    ];

    for (const item of testInputs) {
      let caught = false;
      try {
        await labelFace(valFace._id, testUserId, item.name);
      } catch (err) {
        caught = true;
        console.log(`Input "${item.name}" rejected correctly. Msg: "${err.message}"`);
        if (!err.message.toLowerCase().includes(item.error)) {
          throw new Error(`TEST 7 FAILED: Mismatched error context for "${item.name}". Expected keyword: "${item.error}", got: "${err.message}"`);
        }
      }
      if (!caught) {
        throw new Error(`TEST 7 FAILED: Input "${item.name}" should have thrown an error`);
      }
    }
    console.log("[TEST 7] PASSED.");

    // --- TEST 8: Return Payload Shape check ---
    console.log("\n[TEST 8] Testing returned payload format matches MongoDB state...");
    // Seed one last face
    const finalFace = new Face({
      photoId: testPhotoId,
      personId: null,
      userId: testUserId,
      embedding: testFaceEmbedding,
      bbox: testFaceBbox,
      isLabeled: false
    });
    await finalFace.save();

    const payload = await labelFace(finalFace._id, testUserId, "  Aunt  ");
    console.log("Result Payload:", payload);
    
    if (
      payload.success !== true ||
      payload.faceId.toString() !== finalFace._id.toString() ||
      payload.personName !== "Aunt" ||
      payload.createdPerson !== true
    ) {
      throw new Error("TEST 8 FAILED: Return payload format or value mismatch");
    }
    
    const dbFace = await Face.findById(finalFace._id);
    if (dbFace.personId.toString() !== payload.personId.toString()) {
      throw new Error("TEST 8 FAILED: Database Person ID mismatch from payload");
    }
    
    const dbPerson = await Person.findById(payload.personId);
    if (dbPerson.name !== "Aunt") {
      throw new Error("TEST 8 FAILED: Whitespace trimming not persisted correctly");
    }
    console.log("[TEST 8] PASSED.");

    // Clean up all mock records
    await Face.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });
    await Person.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });
    await Photo.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });

    console.log("\n=== ALL FACE LABELING SERVICE TESTS PASSED SUCCESSFULLY ===");

  } catch (err) {
    console.error("\nTEST SUITE CRITICAL FAILURE:", err.message);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log("Database connection closed.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
