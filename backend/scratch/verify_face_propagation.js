import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { labelFace } from "../src/services/faceLabeling.service.js";
import { propagateFaceLabel } from "../src/services/facePropagation.service.js";
import Person from "../src/models/Person.js";
import Face from "../src/models/Face.js";
import Photo from "../src/models/Photo.js";
import { env } from "../src/config/env.js";

// Helper to make a 512-dimension unit vector with desired first/second values
const makeVector = (size, val = 0.0) => Array(size).fill(val);

// Helper to create a unit vector with an exact cosine similarity relative to Vector A (1, 0, 0...)
const makeVectorWithSimilarity = (targetSimilarity) => {
  const vec = Array(512).fill(0.0);
  vec[0] = targetSimilarity;
  vec[1] = Math.sqrt(1.0 - targetSimilarity * targetSimilarity);
  return vec;
};

async function main() {
  console.log("=== STARTING FACE LABEL PROPAGATION VERIFICATION ===");

  await connectDB();

  const testUserId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a10");
  const alternateUserId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a99");
  const testPhotoId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d01");

  // Reference vectors
  // Vector A: [1.0, 0.0, 0.0, ...]
  const vectorA = makeVector(512, 0.0);
  vectorA[0] = 1.0;

  // Vector B: Orthogonal to Vector A (similarity = 0.0)
  const vectorB = makeVector(512, 0.0);
  vectorB[1] = 1.0;

  // Cleanup helper
  const cleanDb = async () => {
    await Face.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });
    await Person.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });
    await Photo.deleteMany({ userId: { $in: [testUserId, alternateUserId] } });
  };

  const seedPhoto = async () => {
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
  };

  try {
    // ==========================================
    // TEST 1: Basic propagation labels matching faces
    // ==========================================
    console.log("\n[TEST 1] Testing basic propagation...");
    await cleanDb();
    await seedPhoto();

    // 1 base face to label, and 5 other matching faces (all unlabeled)
    const baseFace = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vectorA,
      bbox: { x: 10, y: 10, w: 50, h: 50 },
      isLabeled: false
    });
    await baseFace.save();

    const otherFaces = [];
    for (let i = 0; i < 5; i++) {
      const f = new Face({
        photoId: testPhotoId,
        userId: testUserId,
        embedding: vectorA,
        bbox: { x: 20 + i, y: 20 + i, w: 50, h: 50 },
        isLabeled: false
      });
      await f.save();
      otherFaces.push(f);
    }

    const res1 = await labelFace(baseFace._id, testUserId, "Alice");
    console.log("Result 1:", res1);

    if (!res1.success || res1.propagated !== 5) {
      throw new Error(`TEST 1 FAILED: Expected 5 propagated faces, got ${res1.propagated}`);
    }

    // Verify all 5 other faces are now labeled
    for (const f of otherFaces) {
      const dbFace = await Face.findById(f._id);
      if (!dbFace.isLabeled || dbFace.personId.toString() !== res1.personId.toString()) {
        throw new Error("TEST 1 FAILED: Candidate face was not updated correctly in DB");
      }
    }
    console.log("[TEST 1] PASSED.");

    // ==========================================
    // TEST 2: Unrelated faces are not modified
    // ==========================================
    console.log("\n[TEST 2] Testing unrelated faces are not modified...");
    await cleanDb();
    await seedPhoto();

    const baseFace2 = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vectorA,
      bbox: { x: 10, y: 10, w: 50, h: 50 },
      isLabeled: false
    });
    await baseFace2.save();

    const unrelatedFaces = [];
    for (let i = 0; i < 10; i++) {
      const f = new Face({
        photoId: testPhotoId,
        userId: testUserId,
        embedding: vectorB, // Orthogonal, similarity = 0.0
        bbox: { x: 20 + i, y: 20 + i, w: 50, h: 50 },
        isLabeled: false
      });
      await f.save();
      unrelatedFaces.push(f);
    }

    const res2 = await labelFace(baseFace2._id, testUserId, "Bob");
    console.log("Result 2:", res2);

    if (res2.propagated !== 0) {
      throw new Error(`TEST 2 FAILED: Expected 0 propagated faces, got ${res2.propagated}`);
    }

    // Verify unrelated faces are still unlabeled
    for (const f of unrelatedFaces) {
      const dbFace = await Face.findById(f._id);
      if (dbFace.isLabeled || dbFace.personId !== null) {
        throw new Error("TEST 2 FAILED: Unrelated face was incorrectly labeled");
      }
    }
    console.log("[TEST 2] PASSED.");

    // ==========================================
    // TEST 3: Mixed matching and unrelated faces
    // ==========================================
    console.log("\n[TEST 3] Testing mixed matching and unrelated faces...");
    await cleanDb();
    await seedPhoto();

    const baseFace3 = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vectorA,
      bbox: { x: 10, y: 10, w: 50, h: 50 },
      isLabeled: false
    });
    await baseFace3.save();

    const matchedList = [];
    const unmatchedList = [];

    for (let i = 0; i < 5; i++) {
      const f = new Face({
        photoId: testPhotoId,
        userId: testUserId,
        embedding: vectorA,
        bbox: { x: 100 + i, y: 100 + i, w: 50, h: 50 },
        isLabeled: false
      });
      await f.save();
      matchedList.push(f);
    }

    for (let i = 0; i < 7; i++) {
      const f = new Face({
        photoId: testPhotoId,
        userId: testUserId,
        embedding: vectorB,
        bbox: { x: 200 + i, y: 200 + i, w: 50, h: 50 },
        isLabeled: false
      });
      await f.save();
      unmatchedList.push(f);
    }

    const res3 = await labelFace(baseFace3._id, testUserId, "Charlie");
    console.log("Result 3:", res3);

    if (res3.propagated !== 5) {
      throw new Error(`TEST 3 FAILED: Expected 5 propagated, got ${res3.propagated}`);
    }

    for (const f of matchedList) {
      const dbFace = await Face.findById(f._id);
      if (!dbFace.isLabeled || dbFace.personId.toString() !== res3.personId.toString()) {
        throw new Error("TEST 3 FAILED: Matching face was not labeled");
      }
    }

    for (const f of unmatchedList) {
      const dbFace = await Face.findById(f._id);
      if (dbFace.isLabeled || dbFace.personId !== null) {
        throw new Error("TEST 3 FAILED: Orthogonal face was labeled");
      }
    }
    console.log("[TEST 3] PASSED.");

    // ==========================================
    // TEST 4: Bounding box and embedding integrity
    // ==========================================
    console.log("\n[TEST 4] Testing bounding box and embedding integrity...");
    // Let's inspect the matches from Test 3
    for (let i = 0; i < matchedList.length; i++) {
      const original = matchedList[i];
      const updated = await Face.findById(original._id);

      if (updated.photoId.toString() !== original.photoId.toString()) {
        throw new Error("TEST 4 FAILED: photoId changed on propagation");
      }
      if (
        updated.bbox.x !== original.bbox.x ||
        updated.bbox.y !== original.bbox.y ||
        updated.bbox.w !== original.bbox.w ||
        updated.bbox.h !== original.bbox.h
      ) {
        throw new Error("TEST 4 FAILED: BBox changed on propagation");
      }
      if (updated.embedding.length !== original.embedding.length) {
        throw new Error("TEST 4 FAILED: Embedding length changed");
      }
      for (let j = 0; j < updated.embedding.length; j++) {
        if (updated.embedding[j] !== original.embedding[j]) {
          throw new Error("TEST 4 FAILED: Embedding vector changed");
        }
      }
    }
    console.log("[TEST 4] PASSED.");

    // ==========================================
    // TEST 5: Tenancy Boundaries (Cross-Tenant Isolation)
    // ==========================================
    console.log("\n[TEST 5] Testing tenancy boundaries (cross-tenant)...");
    await cleanDb();
    await seedPhoto();

    const userABaseFace = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vectorA,
      bbox: { x: 10, y: 10, w: 50, h: 50 },
      isLabeled: false
    });
    await userABaseFace.save();

    const userBFace = new Face({
      photoId: testPhotoId,
      userId: alternateUserId, // different user
      embedding: vectorA, // same exact embedding
      bbox: { x: 20, y: 20, w: 50, h: 50 },
      isLabeled: false
    });
    await userBFace.save();

    const res5 = await labelFace(userABaseFace._id, testUserId, "Dave");
    console.log("Result 5:", res5);

    if (res5.propagated !== 0) {
      throw new Error(`TEST 5 FAILED: Expected 0 propagated across users, got ${res5.propagated}`);
    }

    const dbUserBFace = await Face.findById(userBFace._id);
    if (dbUserBFace.isLabeled || dbUserBFace.personId !== null) {
      throw new Error("TEST 5 FAILED: Candidate belonging to alternate user was updated");
    }
    console.log("[TEST 5] PASSED.");

    // ==========================================
    // TEST 6: Double Execution Idempotency
    // ==========================================
    console.log("\n[TEST 6] Testing double execution idempotency...");
    // Direct invocation on the already completed propagation
    const res6 = await propagateFaceLabel(userABaseFace._id, res5.personId, testUserId);
    console.log("Result 6:", res6);

    if (res6.checked !== 0 || res6.propagated !== 0) {
      throw new Error(`TEST 6 FAILED: Expected 0 checked and 0 propagated on second pass, got checked: ${res6.checked}, propagated: ${res6.propagated}`);
    }
    console.log("[TEST 6] PASSED.");

    // ==========================================
    // TEST 7: Threshold Boundary Check (slightly below vs exact threshold)
    // ==========================================
    const thresh = env.FACE_PROPAGATION_THRESHOLD;
    console.log(`\n[TEST 7] Testing threshold boundary check (slightly below vs exact threshold: ${thresh})...`);
    await cleanDb();
    await seedPhoto();

    const baseFace7 = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vectorA,
      bbox: { x: 10, y: 10, w: 50, h: 50 },
      isLabeled: false
    });
    await baseFace7.save();

    // Face with similarity slightly below threshold
    const valBelow = thresh - 0.0001;
    const vecBelow = makeVectorWithSimilarity(valBelow);
    const faceBelow = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vecBelow,
      bbox: { x: 11, y: 11, w: 50, h: 50 },
      isLabeled: false
    });
    await faceBelow.save();

    // Face with similarity exactly at threshold
    const vecAbove = makeVectorWithSimilarity(thresh);
    const faceAbove = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vecAbove,
      bbox: { x: 12, y: 12, w: 50, h: 50 },
      isLabeled: false
    });
    await faceAbove.save();

    const res7 = await labelFace(baseFace7._id, testUserId, "Eve");
    console.log("Result 7 (Threshold bounds):", res7);

    if (res7.propagated !== 1) {
      throw new Error(`TEST 7 FAILED: Expected exactly 1 propagated face (the ${thresh} one), got ${res7.propagated}`);
    }

    const dbFaceBelow = await Face.findById(faceBelow._id);
    if (dbFaceBelow.isLabeled || dbFaceBelow.personId !== null) {
      throw new Error(`TEST 7 FAILED: Candidate with similarity ${valBelow} was incorrectly propagated`);
    }

    const dbFaceAbove = await Face.findById(faceAbove._id);
    if (!dbFaceAbove.isLabeled || dbFaceAbove.personId.toString() !== res7.personId.toString()) {
      throw new Error(`TEST 7 FAILED: Candidate with similarity ${thresh} was not propagated`);
    }
    console.log("[TEST 7] PASSED.");

    // ==========================================
    // TEST 8: Malformed Dimension Skip & Safety
    // ==========================================
    console.log("\n[TEST 8] Testing malformed embedding dimension skip behavior...");
    await cleanDb();
    await seedPhoto();

    const baseFace8 = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vectorA,
      bbox: { x: 10, y: 10, w: 50, h: 50 },
      isLabeled: false
    });
    await baseFace8.save();

    // Malformed vector: length 500
    const malformedVector = Array(500).fill(1.0);
    const malformedFace = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: malformedVector,
      embeddingDimension: 500, // force it through validator if custom checks exist
      bbox: { x: 20, y: 20, w: 50, h: 50 },
      isLabeled: false
    });
    // Override standard validator checks for test seeding
    malformedFace.validate = () => {};
    await malformedFace.save();

    // Valid vector: length 512, similarity 1.0
    const validMatchingFace = new Face({
      photoId: testPhotoId,
      userId: testUserId,
      embedding: vectorA,
      bbox: { x: 30, y: 30, w: 50, h: 50 },
      isLabeled: false
    });
    await validMatchingFace.save();

    const res8 = await labelFace(baseFace8._id, testUserId, "Frank");
    console.log("Result 8 (Malformed dimensions):", res8);

    if (res8.propagated !== 1) {
      throw new Error(`TEST 8 FAILED: Expected exactly 1 propagated face, got ${res8.propagated}`);
    }

    const dbMalformed = await Face.findById(malformedFace._id);
    if (dbMalformed.isLabeled || dbMalformed.personId !== null) {
      throw new Error("TEST 8 FAILED: Malformed face was labeled");
    }

    const dbValidMatching = await Face.findById(validMatchingFace._id);
    if (!dbValidMatching.isLabeled || dbValidMatching.personId.toString() !== res8.personId.toString()) {
      throw new Error("TEST 8 FAILED: Valid matching face was not propagated");
    }
    console.log("[TEST 8] PASSED.");

    // Clean up
    await cleanDb();
    console.log("\n=== ALL PROPAGATION SERVICE VERIFICATION TESTS PASSED SUCCESSFULLY ===");

  } catch (err) {
    console.error("\nTEST SUITE CRITICAL FAILURE:", err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("Database connection closed.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
