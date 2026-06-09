import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { cosineSimilarity } from "../src/utils/cosineSimilarity.js";
import { findBestFaceMatch, updatePersonCentroid } from "../src/services/faceMatching.service.js";
import Person from "../src/models/Person.js";
import Face from "../src/models/Face.js";
import Photo from "../src/models/Photo.js";

// Helper to construct a vector of size N filled with a value
const makeVector = (size, val = 0.0) => Array(size).fill(val);

async function main() {
  console.log("=== STARTING FACE EMBEDDING MATCHING VERIFICATION ===");

  // 1. Establish database connection
  await connectDB();

  // Define dummy ObjectIDs for tests
  const testUserId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a10");
  const testPhotoId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a22");

  try {
    // Clean up any existing test records for safety
    await Face.deleteMany({ userId: testUserId });
    await Person.deleteMany({ userId: testUserId });
    await Photo.deleteMany({ userId: testUserId });

    // --- TEST 1: Identical Vectors ---
    console.log("\n[TEST 1] Testing identical vectors (expect similarity = 1.0)...");
    const vecA1 = [1, 2, 3, 4, 5];
    const vecB1 = [1, 2, 3, 4, 5];
    const score1 = cosineSimilarity(vecA1, vecB1);
    console.log("Calculated similarity:", score1);
    if (Math.abs(score1 - 1.0) > 1e-7) {
      throw new Error(`TEST 1 FAILED: Expected 1.0, got ${score1}`);
    }
    console.log("[TEST 1] PASSED.");

    // --- TEST 2: Orthogonal Vectors ---
    console.log("\n[TEST 2] Testing orthogonal vectors (expect similarity = 0.0)...");
    const vecA2 = [1, 0, 0, 0];
    const vecB2 = [0, 1, 0, 0];
    const score2 = cosineSimilarity(vecA2, vecB2);
    console.log("Calculated similarity:", score2);
    if (Math.abs(score2 - 0.0) > 1e-7) {
      throw new Error(`TEST 2 FAILED: Expected 0.0, got ${score2}`);
    }
    console.log("[TEST 2] PASSED.");

    // --- TEST 3: Opposite Vectors ---
    console.log("\n[TEST 3] Testing opposite vectors (expect similarity = -1.0)...");
    const vecA3 = [1, -2, 3];
    const vecB3 = [-1, 2, -3];
    const score3 = cosineSimilarity(vecA3, vecB3);
    console.log("Calculated similarity:", score3);
    if (Math.abs(score3 - (-1.0)) > 1e-7) {
      throw new Error(`TEST 3 FAILED: Expected -1.0, got ${score3}`);
    }
    console.log("[TEST 3] PASSED.");

    // --- TEST 4: Empty Database Handling ---
    console.log("\n[TEST 4] Testing findBestFaceMatch() with empty database...");
    const dummyEmbedding = makeVector(512, 0.1);
    const emptyResult = await findBestFaceMatch(dummyEmbedding, testUserId);
    console.log("Empty db result:", emptyResult);
    if (emptyResult.matched !== false || emptyResult.score !== null) {
      throw new Error("TEST 4 FAILED: Expected { matched: false, score: null }");
    }
    console.log("[TEST 4] PASSED.");

    // --- TEST 5: Known Embedding Match ---
    console.log("\n[TEST 5] Testing findBestFaceMatch() with known embedding match...");
    
    // Create mock Person
    const person = new Person({
      userId: testUserId,
      name: "Test Uncle",
      nameNormalized: "test uncle"
    });
    await person.save();

    // Create a base 512-dimension vector embedding
    const baseEmbedding = makeVector(512, 0.01);
    baseEmbedding[0] = 0.5; // add some structure
    baseEmbedding[10] = -0.2;
    baseEmbedding[511] = 0.1;

    // Create mock Face document with labelSource manual
    const face = new Face({
      photoId: testPhotoId,
      personId: person._id,
      userId: testUserId,
      embedding: baseEmbedding,
      bbox: { x: 10, y: 15, w: 50, h: 55 },
      isLabeled: true,
      labelSource: "manual"
    });
    await face.save();

    // Recompute person centroid
    await updatePersonCentroid(person._id);

    // Create a slightly perturbed vector (high similarity > 0.85)
    const queryEmbedding = [...baseEmbedding];
    queryEmbedding[0] = 0.505; // tiny change
    queryEmbedding[1] = 0.002; // tiny change

    const matchResult = await findBestFaceMatch(queryEmbedding, testUserId);
    console.log("Match Result:", matchResult);
    if (!matchResult.matched) {
      throw new Error("TEST 5 FAILED: Expected a successful match");
    }
    if (matchResult.personId.toString() !== person._id.toString()) {
      throw new Error(`TEST 5 FAILED: Matched wrong person. Expected ${person._id}, got ${matchResult.personId}`);
    }
    if (matchResult.score < 0.85) {
      throw new Error(`TEST 5 FAILED: Expected score > 0.85, got ${matchResult.score}`);
    }
    console.log("[TEST 5] PASSED.");

    // --- TEST 6: Random Embedding No Match ---
    console.log("\n[TEST 6] Testing findBestFaceMatch() with random embedding (no match)...");
    const differentEmbedding = makeVector(512, 0.01);
    differentEmbedding[0] = -0.5; // opposite direction
    differentEmbedding[10] = 0.2;

    const noMatchResult = await findBestFaceMatch(differentEmbedding, testUserId);
    console.log("No Match Result:", noMatchResult);
    if (noMatchResult.matched) {
      throw new Error("TEST 6 FAILED: Expected matched to be false");
    }
    if (noMatchResult.score >= 0.85) {
      throw new Error(`TEST 6 FAILED: Expected score < 0.85, got ${noMatchResult.score}`);
    }
    console.log("[TEST 6] PASSED.");

    // --- TEST 7: Validation Failures (Invalid Dimensions) ---
    console.log("\n[TEST 7] Testing validation failures (expecting errors)...");
    
    // Check 1: Wrong dimensions (length 10)
    let check1Caught = false;
    try {
      await findBestFaceMatch(makeVector(10, 0.1), testUserId);
    } catch (err) {
      check1Caught = true;
      console.log("Caught expected size error:", err.message);
    }
    if (!check1Caught) {
      throw new Error("TEST 7 FAILED: Expected 10-dimension vector to throw an error");
    }

    // Check 2: Non-numeric elements
    let check2Caught = false;
    try {
      const badVec = makeVector(512, 0.1);
      badVec[5] = "not-a-number";
      await findBestFaceMatch(badVec, testUserId);
    } catch (err) {
      check2Caught = true;
      console.log("Caught expected type error:", err.message);
    }
    if (!check2Caught) {
      throw new Error("TEST 7 FAILED: Expected non-numeric vector element to throw an error");
    }

    console.log("[TEST 7] PASSED.");

    // Clean up test records
    await Face.deleteMany({ userId: testUserId });
    await Person.deleteMany({ userId: testUserId });
    await Photo.deleteMany({ userId: testUserId });

    console.log("\n=== ALL FACE EMBEDDING MATCHING TESTS PASSED SUCCESSFULLY ===");

  } catch (err) {
    console.error("\nTEST SUITE CRITICAL FAILURE:", err.message);
    process.exit(1);
  } finally {
    // Close database connection gracefully
    await mongoose.connection.close();
    console.log("Database connection closed.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
