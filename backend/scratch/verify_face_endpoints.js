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
  console.log("=== STARTING REST API ENDPOINTS VERIFICATION ===");

  await connectDB();

  // Test ObjectIDs
  const userIdA = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a01");
  const userIdB = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a02");
  const photoIdA = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d01");

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

  // Seed baseline data
  const seedBaseline = async () => {
    // 1. Seed users
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

    // 2. Seed photo
    const photo = new Photo({
      _id: photoIdA,
      userId: userIdA,
      url: "https://example.com/testphoto.jpg",
      cloudinaryPublicId: "drishyamitra/photos/testphoto",
      width: 1000,
      height: 800,
      status: "completed"
    });
    await photo.save();
  };

  await cleanDb();
  await seedBaseline();

  // Spin up express server dynamically
  const server = app.listen(0);
  const port = server.address().port;
  console.log(`Test server started on port ${port}`);

  // Create axios HTTP clients
  const clientAnonymous = axios.create({
    baseURL: `http://localhost:${port}`,
    validateStatus: () => true // Don't throw on non-200 responses
  });

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
    // TEST 1: Unauthenticated request returns HTTP 401
    // ==========================================
    console.log("\n[TEST 1] GET /api/faces/unlabeled without JWT...");
    const res1 = await clientAnonymous.get("/api/faces/unlabeled");
    console.log("Status:", res1.status, "Body:", res1.data);
    if (res1.status !== 401) {
      throw new Error(`TEST 1 FAILED: Expected HTTP 401, got ${res1.status}`);
    }
    console.log("[TEST 1] PASSED.");

    // ==========================================
    // TEST 2: User with no faces returns HTTP 200 with empty list []
    // ==========================================
    console.log("\n[TEST 2] GET /api/faces/unlabeled for User B (no faces)...");
    const res2 = await clientB.get("/api/faces/unlabeled");
    console.log("Status:", res2.status, "Body:", res2.data);
    if (res2.status !== 200) {
      throw new Error(`TEST 2 FAILED: Expected HTTP 200, got ${res2.status}`);
    }
    if (!Array.isArray(res2.data) || res2.data.length !== 0) {
      throw new Error("TEST 2 FAILED: Expected response to be empty array []");
    }
    console.log("[TEST 2] PASSED.");

    // ==========================================
    // TEST 3: GET returns sorted, paginated unlabeled faces scoped to user
    // ==========================================
    console.log("\n[TEST 3] GET /api/faces/unlabeled with sorting and pagination...");
    const vectorA = makeVector(512, 0.0);
    vectorA[0] = 1.0;
    const vectorB = makeVector(512, 0.0);
    vectorB[1] = 1.0;

    // Seed 5 unlabeled faces for User A, spaced in time
    const now = Date.now();
    const faceIds = [];
    for (let i = 0; i < 5; i++) {
      const face = new Face({
        photoId: photoIdA,
        userId: userIdA,
        embedding: (i < 3) ? vectorA : vectorB,
        bbox: { x: 10 + i, y: 10 + i, w: 50, h: 50 },
        isLabeled: false,
        createdAt: new Date(now - (500000 - i * 100000)) // Determinstic oldest to newest
      });
      await face.save();
      faceIds.push(face._id);
    }

    // Query Page 1, limit 2
    const res3a = await clientA.get("/api/faces/unlabeled?page=1&limit=2");
    console.log("Page 1 Status:", res3a.status, "Page 1 Items:", res3a.data.length);
    if (res3a.status !== 200 || res3a.data.length !== 2) {
      throw new Error(`TEST 3 FAILED: Expected 2 items on Page 1, got status ${res3a.status} and length ${res3a.data.length}`);
    }

    // Verify ordering is oldest first (first 2 faceIds)
    if (
      res3a.data[0].faceId.toString() !== faceIds[0].toString() ||
      res3a.data[1].faceId.toString() !== faceIds[1].toString()
    ) {
      throw new Error("TEST 3 FAILED: Page 1 items are not the oldest 2 faces in order");
    }

    // Verify properties
    const sample = res3a.data[0];
    if (
      !sample.faceId ||
      !sample.photoId ||
      !sample.photoUrl ||
      sample.bbox.x === undefined
    ) {
      throw new Error(`TEST 3 FAILED: Returned face does not have all expected payload fields. Sample: ${JSON.stringify(sample)}`);
    }

    // Query Page 2, limit 2
    const res3b = await clientA.get("/api/faces/unlabeled?page=2&limit=2");
    console.log("Page 2 Items:", res3b.data.length);
    if (res3b.data.length !== 2) {
      throw new Error(`TEST 3 FAILED: Expected 2 items on Page 2, got ${res3b.data.length}`);
    }
    if (
      res3b.data[0].faceId.toString() !== faceIds[2].toString() ||
      res3b.data[1].faceId.toString() !== faceIds[3].toString()
    ) {
      throw new Error("TEST 3 FAILED: Page 2 items did not resolve to faceIds indices 2 and 3");
    }

    // Query User B again: User B should still see empty list (Strict Tenancy check)
    const res3c = await clientB.get("/api/faces/unlabeled");
    if (res3c.data.length !== 0) {
      throw new Error(`TEST 3 FAILED: User B retrieved User A's faces! Count: ${res3c.data.length}`);
    }
    console.log("[TEST 3] PASSED.");

    // ==========================================
    // TEST 4: Successful label update propagates matches
    // ==========================================
    console.log("\n[TEST 4] POST /api/faces/:faceId/label (valid)...");
    const faceToLabel = faceIds[0];
    const res4 = await clientA.post(`/api/faces/${faceToLabel}/label`, {
      personName: "Uncle Bob"
    });
    console.log("Label Status:", res4.status, "Body:", res4.data);

    if (res4.status !== 200 || !res4.data.success) {
      throw new Error(`TEST 4 FAILED: Expected status 200 success, got status ${res4.status}`);
    }

    // There were 3 vectorA faces: 1 got labeled directly, other 2 should have propagated!
    if (res4.data.propagated !== 2) {
      throw new Error(`TEST 4 FAILED: Expected 2 propagated matching faces, got ${res4.data.propagated}`);
    }

    // Verify DB states: Direct face and matching faces are labeled
    const dbBaseFace = await Face.findById(faceIds[0]);
    if (!dbBaseFace.isLabeled || !dbBaseFace.personId) {
      throw new Error("TEST 4 FAILED: Base face was not marked labeled in database");
    }

    const dbPropagatedFace1 = await Face.findById(faceIds[1]);
    const dbPropagatedFace2 = await Face.findById(faceIds[2]);
    if (!dbPropagatedFace1.isLabeled || dbPropagatedFace1.personId.toString() !== dbBaseFace.personId.toString()) {
      throw new Error("TEST 4 FAILED: Propagated face 1 was not labeled in database");
    }
    if (!dbPropagatedFace2.isLabeled || dbPropagatedFace2.personId.toString() !== dbBaseFace.personId.toString()) {
      throw new Error("TEST 4 FAILED: Propagated face 2 was not labeled in database");
    }

    // Verify B-vector faces are NOT labeled (orthogonal vectorB)
    const dbUnmatchedFace1 = await Face.findById(faceIds[3]);
    const dbUnmatchedFace2 = await Face.findById(faceIds[4]);
    if (dbUnmatchedFace1.isLabeled || dbUnmatchedFace2.isLabeled) {
      throw new Error("TEST 4 FAILED: Orthogonal face was incorrectly labeled via propagation");
    }
    console.log("[TEST 4] PASSED.");

    // ==========================================
    // TEST 5: Controller and service input validation checks return HTTP 400
    // ==========================================
    console.log("\n[TEST 5] POST /api/faces/:faceId/label validation checks (invalid format & empty name)...");
    
    // Invalid faceId format
    const res5a = await clientA.post("/api/faces/invalid-id-123/label", {
      personName: "Aunt May"
    });
    console.log("Invalid ID Status:", res5a.status, "Body:", res5a.data);
    if (res5a.status !== 400 || res5a.data.success !== false) {
      throw new Error(`TEST 5 FAILED: Expected HTTP 400 for invalid ID format, got ${res5a.status}`);
    }

    // Empty/Missing personName
    const res5b = await clientA.post(`/api/faces/${faceIds[3]}/label`, {
      personName: "   "
    });
    console.log("Empty Name Status:", res5b.status, "Body:", res5b.data);
    if (res5b.status !== 400 || res5b.data.success !== false) {
      throw new Error(`TEST 5 FAILED: Expected HTTP 400 for empty personName, got ${res5b.status}`);
    }

    // Non-string personName
    const res5c = await clientA.post(`/api/faces/${faceIds[3]}/label`, {
      personName: 1234
    });
    console.log("Non-string Name Status:", res5c.status, "Body:", res5c.data);
    if (res5c.status !== 400 || res5c.data.success !== false) {
      throw new Error(`TEST 5 FAILED: Expected HTTP 400 for non-string personName, got ${res5c.status}`);
    }
    console.log("[TEST 5] PASSED.");

    // ==========================================
    // TEST 6: Relabeling attempt returns HTTP 400
    // ==========================================
    console.log("\n[TEST 6] POST /api/faces/:faceId/label on already labeled face...");
    const res6 = await clientA.post(`/api/faces/${faceToLabel}/label`, {
      personName: "Aunt May"
    });
    console.log("Relabel Status:", res6.status, "Body:", res6.data);
    if (res6.status !== 400 || res6.data.success !== false) {
      throw new Error(`TEST 6 FAILED: Expected HTTP 400 for already labeled face, got ${res6.status}`);
    }
    console.log("[TEST 6] PASSED.");

    // ==========================================
    // TEST 7: Unauthorized label attempt returns HTTP 403
    // ==========================================
    console.log("\n[TEST 7] POST /api/faces/:faceId/label by different user (User B)...");
    const res7 = await clientB.post(`/api/faces/${faceIds[3]}/label`, {
      personName: "Aunt May"
    });
    console.log("Cross-tenant Status:", res7.status, "Body:", res7.data);
    if (res7.status !== 403 || res7.data.success !== false) {
      throw new Error(`TEST 7 FAILED: Expected HTTP 403 for unauthorized ownership, got ${res7.status}`);
    }
    console.log("[TEST 7] PASSED.");

    // ==========================================
    // TEST 8: Properties (embedding, bbox, photoId) remain unchanged
    // ==========================================
    console.log("\n[TEST 8] Checking properties remain unchanged after label & propagation...");
    // Check direct labeled face
    const finalBaseFace = await Face.findById(faceIds[0]);
    if (
      finalBaseFace.photoId.toString() !== photoIdA.toString() ||
      finalBaseFace.bbox.x !== 10 ||
      finalBaseFace.embedding.length !== 512 ||
      finalBaseFace.embedding[0] !== 1.0
    ) {
      throw new Error("TEST 8 FAILED: Direct labeled face properties changed!");
    }

    // Check propagated face
    const finalPropFace = await Face.findById(faceIds[1]);
    if (
      finalPropFace.photoId.toString() !== photoIdA.toString() ||
      finalPropFace.bbox.x !== 11 ||
      finalPropFace.embedding.length !== 512 ||
      finalPropFace.embedding[0] !== 1.0
    ) {
      throw new Error("TEST 8 FAILED: Propagated face properties changed!");
    }
    console.log("[TEST 8] PASSED.");

    await cleanDb();
    console.log("\n=== ALL REST API ENDPOINTS VERIFICATION TESTS PASSED SUCCESSFULLY ===");

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
