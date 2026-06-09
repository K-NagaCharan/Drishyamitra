import mongoose from "mongoose";
import axios from "axios";
import { connectDB } from "../src/config/db.js";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Face from "../src/models/Face.js";
import Photo from "../src/models/Photo.js";
import Person from "../src/models/Person.js";
import { generateToken } from "../src/utils/jwt.js";

const makeVector = (size, val = 0.0) => Array(size).fill(val);

async function main() {
  console.log("=== STARTING FACE SUGGESTION API VERIFICATION ===");

  await connectDB();

  // Test ObjectIDs
  const userIdA = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a01");
  const userIdB = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a02");
  const photoIdA = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d01");
  const photoIdB = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d02");

  // Create JWTs
  const tokenA = generateToken(userIdA.toString(), "user_a");
  const tokenB = generateToken(userIdB.toString(), "user_b");

  // Clean DB helper
  const cleanDb = async () => {
    await Face.deleteMany({ userId: { $in: [userIdA, userIdB] } });
    await Person.deleteMany({ userId: { $in: [userIdA, userIdB] } });
    await Photo.deleteMany({ userId: { $in: [userIdA, userIdB] } });
    await User.deleteMany({ _id: { $in: [userIdA, userIdB] } });
  };

  await cleanDb();

  // Create mock users
  const userA = new User({
    _id: userIdA,
    username: "user_a",
    email: "usera@example.com",
    passwordHash: "hash123"
  });
  await userA.save();

  const userB = new User({
    _id: userIdB,
    username: "user_b",
    email: "userb@example.com",
    passwordHash: "hash123"
  });
  await userB.save();

  // Seed photos
  const photoA = new Photo({
    _id: photoIdA,
    userId: userIdA,
    url: "https://example.com/photoA.jpg",
    cloudinaryPublicId: "apes/photos/photoA",
    width: 800,
    height: 600,
    status: "completed"
  });
  await photoA.save();

  const photoB = new Photo({
    _id: photoIdB,
    userId: userIdB,
    url: "https://example.com/photoB.jpg",
    cloudinaryPublicId: "apes/photos/photoB",
    width: 800,
    height: 600,
    status: "completed"
  });
  await photoB.save();

  // Seed reference vectors
  const vectorA = makeVector(512, 0.0);
  vectorA[0] = 1.0; // Reference "Dad" embedding
  
  const vectorB = makeVector(512, 0.0);
  vectorB[1] = 1.0; // Reference orthogonal vector

  // 1. Create a Person ("Dad") for User A
  const personA = new Person({
    userId: userIdA,
    name: "Dad",
    nameNormalized: "dad"
  });
  await personA.save();

  // 2. Create a labeled face for "Dad" under User A
  const labeledFaceA = new Face({
    photoId: photoIdA,
    userId: userIdA,
    personId: personA._id,
    embedding: vectorA,
    bbox: { x: 10, y: 10, w: 50, h: 50 },
    isLabeled: true
  });
  await labeledFaceA.save();

  // 3. Create a candidate unlabeled face for User A (exact visual match)
  const candidateFaceA = new Face({
    photoId: photoIdA,
    userId: userIdA,
    personId: null,
    embedding: vectorA,
    bbox: { x: 20, y: 20, w: 50, h: 50 },
    isLabeled: false
  });
  await candidateFaceA.save();

  // 4. Create an orthogonal unlabeled face for User A (should NOT match)
  const unmatchedFaceA = new Face({
    photoId: photoIdA,
    userId: userIdA,
    personId: null,
    embedding: vectorB,
    bbox: { x: 30, y: 30, w: 50, h: 50 },
    isLabeled: false
  });
  await unmatchedFaceA.save();

  // 5. Create an unlabeled face for User B with the same vectorA embedding
  // User B has no labeled faces, so this must return suggested: false (Tenancy protection check)
  const candidateFaceB = new Face({
    photoId: photoIdB,
    userId: userIdB,
    personId: null,
    embedding: vectorA,
    bbox: { x: 40, y: 40, w: 50, h: 50 },
    isLabeled: false
  });
  await candidateFaceB.save();

  // Spin up express server dynamically
  const server = app.listen(0);
  const port = server.address().port;
  console.log(`Test server started on port ${port}`);

  const clientA = axios.create({
    baseURL: `http://localhost:${port}`,
    headers: { Authorization: `Bearer ${tokenA}` },
    validateStatus: () => true
  });

  const clientB = axios.create({
    baseURL: `http://localhost:${port}`,
    headers: { Authorization: `Bearer ${tokenB}` },
    validateStatus: () => true
  });

  try {
    // ==========================================
    // TEST 1: Suggestion endpoint returns visual match on high confidence similarity score
    // ==========================================
    console.log("\n[TEST 1] GET /api/faces/:faceId/suggest for close match (vectorA)...");
    const res1 = await clientA.get(`/api/faces/${candidateFaceA._id}/suggest`);
    console.log("Status:", res1.status, "Body:", res1.data);
    
    if (res1.status !== 200) {
      throw new Error(`TEST 1 FAILED: Expected HTTP 200, got ${res1.status}`);
    }
    if (!res1.data.suggested || res1.data.personName !== "Dad" || res1.data.score !== 1.0) {
      throw new Error("TEST 1 FAILED: Mismatched suggestion results");
    }
    console.log("[TEST 1] PASSED.");

    // ==========================================
    // TEST 2: Suggestion endpoint returns suggested: false on low confidence similarity
    // ==========================================
    console.log("\n[TEST 2] GET /api/faces/:faceId/suggest for orthogonal vector (vectorB)...");
    const res2 = await clientA.get(`/api/faces/${unmatchedFaceA._id}/suggest`);
    console.log("Status:", res2.status, "Body:", res2.data);

    if (res2.status !== 200) {
      throw new Error(`TEST 2 FAILED: Expected HTTP 200, got ${res2.status}`);
    }
    if (res2.data.suggested !== false) {
      throw new Error("TEST 2 FAILED: Expected suggested: false for orthogonal face");
    }
    console.log("[TEST 2] PASSED.");

    // ==========================================
    // TEST 3: Tenancy boundary check returns HTTP 403 on unauthorized face query
    // ==========================================
    console.log("\n[TEST 3] GET /api/faces/:faceId/suggest for User B's face with User A's token...");
    const res3a = await clientA.get(`/api/faces/${candidateFaceB._id}/suggest`);
    console.log("Cross-tenant Status:", res3a.status, "Body:", res3a.data);

    if (res3a.status !== 403) {
      throw new Error(`TEST 3 FAILED: Expected HTTP 403, got ${res3a.status}`);
    }

    // Now query User B's face using User B's token. User A's labels must NOT leak to User B!
    console.log("\n[TEST 3] GET /api/faces/:faceId/suggest for User B's face with User B's token...");
    const res3b = await clientB.get(`/api/faces/${candidateFaceB._id}/suggest`);
    console.log("User B query Status:", res3b.status, "Body:", res3b.data);

    if (res3b.status !== 200) {
      throw new Error(`TEST 3 FAILED: Expected HTTP 200, got ${res3b.status}`);
    }
    if (res3b.data.suggested !== false) {
      throw new Error("TEST 3 FAILED: User A's labeled person details leaked to User B!");
    }
    console.log("[TEST 3] PASSED.");

    // ==========================================
    // TEST 4: Format check returns HTTP 400 on malformed faceId path parameter
    // ==========================================
    console.log("\n[TEST 4] GET /api/faces/:faceId/suggest with invalid faceId string...");
    const res4 = await clientA.get("/api/faces/invalid-id-format-xyz/suggest");
    console.log("Invalid format Status:", res4.status, "Body:", res4.data);

    if (res4.status !== 400) {
      throw new Error(`TEST 4 FAILED: Expected HTTP 400, got ${res4.status}`);
    }
    console.log("[TEST 4] PASSED.");

    // ==========================================
    // TEST 5: Standard labeling and propagation execute cleanly after suggestions confirm
    // ==========================================
    console.log("\n[TEST 5] POST /api/faces/:faceId/label with suggested name 'Dad'...");
    // Direct label confirmation query
    const res5 = await clientA.post(`/api/faces/${candidateFaceA._id}/label`, {
      personName: res1.data.personName
    });
    console.log("Confirm Label Status:", res5.status, "Body:", res5.data);

    if (res5.status !== 200 || !res5.data.success) {
      throw new Error(`TEST 5 FAILED: Expected HTTP 200 success, got status ${res5.status}`);
    }

    // Verify Direct Face is now labeled in DB
    const dbCandidateFace = await Face.findById(candidateFaceA._id);
    if (!dbCandidateFace.isLabeled || dbCandidateFace.personId.toString() !== personA._id.toString()) {
      throw new Error("TEST 5 FAILED: Candidate face not labeled under 'Dad' in DB");
    }
    console.log("[TEST 5] PASSED.");

    await cleanDb();
    console.log("\n=== ALL FACE SUGGESTION API TESTS PASSED SUCCESSFULLY ===");

  } catch (err) {
    console.error("\nTEST SUITE CRITICAL FAILURE:", err.message);
    process.exit(1);
  } finally {
    server.close();
    await mongoose.connection.close();
    console.log("Server stopped and database connection closed.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
