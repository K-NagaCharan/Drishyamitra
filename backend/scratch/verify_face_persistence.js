import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { processRecognizedFaces } from "../src/services/facePersistence.service.js";
import Person from "../src/models/Person.js";
import Face from "../src/models/Face.js";
import Photo from "../src/models/Photo.js";
import { updatePersonCentroid } from "../src/services/faceMatching.service.js";

const makeVector = (size, val = 0.0) => Array(size).fill(val);

async function main() {
  console.log("=== STARTING FACE PERSISTENCE PIPELINE VERIFICATION ===");

  // 1. Establish database connection
  await connectDB();

  // Define ObjectIDs
  const testUserId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a10");
  const dummyPhotoId1 = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d01");
  const dummyPhotoId2 = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad68d022");
  const nonExistentPhotoId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad68d999");

  try {
    // Clean up any existing records
    await Face.deleteMany({ userId: testUserId });
    await Person.deleteMany({ userId: testUserId });
    await Photo.deleteMany({ userId: testUserId });

    // Seed mock Photo records
    const photo1 = new Photo({
      _id: dummyPhotoId1,
      userId: testUserId,
      url: "https://example.com/photo1.jpg",
      cloudinaryPublicId: "drishyamitra/photos/photo1",
      width: 800,
      height: 600,
      status: "completed"
    });
    await photo1.save();

    const photo2 = new Photo({
      _id: dummyPhotoId2,
      userId: testUserId,
      url: "https://example.com/photo2.jpg",
      cloudinaryPublicId: "drishyamitra/photos/photo2",
      width: 800,
      height: 600,
      status: "completed"
    });
    await photo2.save();

    // Seed mock Person ("Test Dad")
    const personDad = new Person({
      userId: testUserId,
      name: "Test Dad",
      nameNormalized: "test dad"
    });
    await personDad.save();

    // Create a base vector for Test Dad
    const dadEmbedding = makeVector(512, 0.01);
    dadEmbedding[0] = 0.5;

    // Seed mock Face for Test Dad
    const faceDad = new Face({
      photoId: dummyPhotoId1,
      personId: personDad._id,
      userId: testUserId,
      embedding: dadEmbedding,
      bbox: { x: 10, y: 10, w: 50, h: 50 },
      isLabeled: true,
      labelSource: "manual"
    });
    await faceDad.save();

    // Recalculate centroid for personDad
    await updatePersonCentroid(personDad._id);

    // --- TEST 1: Empty Faces Array ---
    console.log("\n[TEST 1] Testing processRecognizedFaces() with empty faces array...");
    const summary1 = await processRecognizedFaces(dummyPhotoId2, []);
    console.log("Summary 1:", summary1);
    if (summary1.processed !== 0 || summary1.matched !== 0 || summary1.unknown !== 0 || summary1.faceIds.length !== 0) {
      throw new Error("TEST 1 FAILED: Expected empty summary outcome");
    }
    console.log("[TEST 1] PASSED.");

    // Clear faces on photo2 for next test
    await Face.deleteMany({ photoId: dummyPhotoId2 });

    // --- TEST 2: Single Known Face ---
    console.log("\n[TEST 2] Testing processRecognizedFaces() with a single known face match...");
    
    // Perturbed vector matching Test Dad (similarity close to 1.0)
    const queryDadEmbedding = [...dadEmbedding];
    queryDadEmbedding[0] = 0.505;

    const summary2 = await processRecognizedFaces(dummyPhotoId2, [
      {
        bbox: { x: 20, y: 20, w: 45, h: 45 },
        embedding: queryDadEmbedding
      }
    ]);
    console.log("Summary 2:", summary2);
    if (summary2.processed !== 1 || summary2.matched !== 1 || summary2.unknown !== 0 || summary2.faceIds.length !== 1) {
      throw new Error("TEST 2 FAILED: Expected match summary");
    }

    // Verify face record linked in MongoDB
    const persistedFace2 = await Face.findById(summary2.faceIds[0]);
    if (!persistedFace2) {
      throw new Error("TEST 2 FAILED: Face document not persisted");
    }
    if (persistedFace2.personId.toString() !== personDad._id.toString()) {
      throw new Error("TEST 2 FAILED: Expected face to be linked to Test Dad");
    }
    if (!persistedFace2.isLabeled) {
      throw new Error("TEST 2 FAILED: Expected isLabeled to be true");
    }
    console.log("[TEST 2] PASSED.");

    // Clear faces on photo2 for next test
    await Face.deleteMany({ photoId: dummyPhotoId2 });

    // --- TEST 3: Single Unknown Face ---
    console.log("\n[TEST 3] Testing processRecognizedFaces() with single unknown face...");
    const randomEmbedding = makeVector(512, 0.01);
    randomEmbedding[0] = -0.5; // orthogonal/opposite

    const summary3 = await processRecognizedFaces(dummyPhotoId2, [
      {
        bbox: { x: 30, y: 30, w: 40, h: 40 },
        embedding: randomEmbedding
      }
    ]);
    console.log("Summary 3:", summary3);
    if (summary3.processed !== 1 || summary3.matched !== 0 || summary3.unknown !== 1 || summary3.faceIds.length !== 1) {
      throw new Error("TEST 3 FAILED: Expected unknown summary");
    }

    // Verify face record in MongoDB
    const persistedFace3 = await Face.findById(summary3.faceIds[0]);
    if (!persistedFace3) {
      throw new Error("TEST 3 FAILED: Face document not persisted");
    }
    if (persistedFace3.personId !== null) {
      throw new Error("TEST 3 FAILED: Expected personId to be null");
    }
    if (persistedFace3.isLabeled) {
      throw new Error("TEST 3 FAILED: Expected isLabeled to be false");
    }
    console.log("[TEST 3] PASSED.");

    // Clear faces on photo2 for next test
    await Face.deleteMany({ photoId: dummyPhotoId2 });

    // --- TEST 4 & 5: Mixed Image and Data quality check ---
    console.log("\n[TEST 4 & 5] Testing mixed faces (3 known, 2 unknown) and data quality constraints...");
    
    // Seed 2 more mock people
    const personMom = new Person({ userId: testUserId, name: "Test Mom", nameNormalized: "test mom" });
    await personMom.save();
    const momEmbedding = makeVector(512, 0.01);
    momEmbedding[1] = 0.5;
    const faceMom = new Face({
      photoId: dummyPhotoId1,
      personId: personMom._id,
      userId: testUserId,
      embedding: momEmbedding,
      bbox: { x: 5, y: 5, w: 30, h: 30 },
      isLabeled: true,
      labelSource: "manual"
    });
    await faceMom.save();
    await updatePersonCentroid(personMom._id);

    const personSister = new Person({ userId: testUserId, name: "Test Sister", nameNormalized: "test sister" });
    await personSister.save();
    const sisterEmbedding = makeVector(512, 0.01);
    sisterEmbedding[2] = 0.5;
    const faceSister = new Face({
      photoId: dummyPhotoId1,
      personId: personSister._id,
      userId: testUserId,
      embedding: sisterEmbedding,
      bbox: { x: 8, y: 8, w: 35, h: 35 },
      isLabeled: true,
      labelSource: "manual"
    });
    await faceSister.save();
    await updatePersonCentroid(personSister._id);

    // Query elements
    const qDad = [...dadEmbedding]; qDad[0] = 0.502;
    const qMom = [...momEmbedding]; qMom[1] = 0.502;
    const qSister = [...sisterEmbedding]; qSister[2] = 0.502;
    const qUnknown1 = makeVector(512, 0.01); qUnknown1[100] = 0.5; // completely different
    const qUnknown2 = makeVector(512, 0.01); qUnknown2[200] = 0.5; // completely different

    const mixedSummary = await processRecognizedFaces(dummyPhotoId2, [
      { bbox: { x: 1, y: 1, w: 10, h: 10 }, embedding: qDad },
      { bbox: { x: 2, y: 2, w: 10, h: 10 }, embedding: qMom },
      { bbox: { x: 3, y: 3, w: 10, h: 10 }, embedding: qSister },
      { bbox: { x: 4, y: 4, w: 10, h: 10 }, embedding: qUnknown1 },
      { bbox: { x: 5, y: 5, w: 10, h: 10 }, embedding: qUnknown2 }
    ]);

    console.log("Mixed Summary:", mixedSummary);
    if (
      mixedSummary.processed !== 5 || 
      mixedSummary.matched !== 3 || 
      mixedSummary.unknown !== 2 || 
      mixedSummary.faceIds.length !== 5
    ) {
      throw new Error("TEST 4 FAILED: Mixed summaries mismatch");
    }

    // Verify data quality constraints on all 5 saved faces
    for (const id of mixedSummary.faceIds) {
      const persistedDoc = await Face.findById(id);
      if (!persistedDoc) throw new Error("TEST 5 FAILED: Face document not saved");
      if (!persistedDoc.photoId || !persistedDoc.userId || !persistedDoc.embedding || !persistedDoc.bbox) {
        throw new Error("TEST 5 FAILED: Persisted doc is missing required fields");
      }
      if (persistedDoc.embedding.length !== 512) {
        throw new Error("TEST 5 FAILED: Persisted embedding dimensions should be 512");
      }
      if (persistedDoc.bbox.w <= 0 || persistedDoc.bbox.h <= 0) {
        throw new Error("TEST 5 FAILED: Invalid coordinates saved");
      }
    }
    console.log("[TEST 4 & 5] PASSED.");

    // --- TEST 6: Idempotency Check ---
    console.log("\n[TEST 6] Testing idempotency (second process run on same photo should fail)...");
    let test6Caught = false;
    try {
      await processRecognizedFaces(dummyPhotoId2, [
        { bbox: { x: 1, y: 1, w: 10, h: 10 }, embedding: qDad }
      ]);
    } catch (err) {
      test6Caught = true;
      console.log("Caught expected error:", err.message);
      if (err.message !== "Faces already processed for this photo") {
        throw new Error(`TEST 6 FAILED: Unexpected error msg: ${err.message}`);
      }
    }
    if (!test6Caught) {
      throw new Error("TEST 6 FAILED: Second run on same photo did not throw");
    }
    console.log("[TEST 6] PASSED.");

    // Clear faces on photo2 for next test
    await Face.deleteMany({ photoId: dummyPhotoId2 });

    // --- TEST 7: Skipping Invalid Bounding Box / Embedding Length ---
    console.log("\n[TEST 7] Testing invalid dimension & bbox filtering skips...");
    
    // We pass 4 items:
    // - 1 valid face (unknown)
    // - 1 face with length 10 embedding (invalid)
    // - 1 face with 0 width bbox (invalid)
    // - 1 face with negative height bbox (invalid)
    const test7Summary = await processRecognizedFaces(dummyPhotoId2, [
      { bbox: { x: 1, y: 1, w: 10, h: 10 }, embedding: makeVector(512, 0.02) },
      { bbox: { x: 2, y: 2, w: 10, h: 10 }, embedding: makeVector(10, 0.02) },
      { bbox: { x: 3, y: 3, w: 0, h: 10 }, embedding: makeVector(512, 0.02) },
      { bbox: { x: 4, y: 4, w: 10, h: -5 }, embedding: makeVector(512, 0.02) }
    ]);
    console.log("Summary 7:", test7Summary);
    if (test7Summary.processed !== 1 || test7Summary.matched !== 0 || test7Summary.unknown !== 1 || test7Summary.faceIds.length !== 1) {
      throw new Error("TEST 7 FAILED: Expected filter skips to drop 3 invalid faces");
    }
    console.log("[TEST 7] PASSED.");

    // --- TEST 8: Invalid photoId ---
    console.log("\n[TEST 8] Testing invalid photoId throws error...");
    let test8Caught = false;
    try {
      await processRecognizedFaces(nonExistentPhotoId, [
        { bbox: { x: 1, y: 1, w: 10, h: 10 }, embedding: qDad }
      ]);
    } catch (err) {
      test8Caught = true;
      console.log("Caught expected error:", err.message);
      if (err.message !== "Photo not found") {
        throw new Error(`TEST 8 FAILED: Unexpected error msg: ${err.message}`);
      }
    }
    if (!test8Caught) {
      throw new Error("TEST 8 FAILED: Non-existent photo ID did not throw");
    }
    console.log("[TEST 8] PASSED.");

    // Clean up mock data records
    await Face.deleteMany({ userId: testUserId });
    await Person.deleteMany({ userId: testUserId });
    await Photo.deleteMany({ userId: testUserId });

    console.log("\n=== ALL FACE PERSISTENCE PIPELINE TESTS PASSED SUCCESSFULLY ===");

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
