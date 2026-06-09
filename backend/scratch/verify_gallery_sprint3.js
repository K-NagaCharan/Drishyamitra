import mongoose from "mongoose";
import axios from "axios";
import { connectDB } from "../src/config/db.js";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Face from "../src/models/Face.js";
import Photo from "../src/models/Photo.js";
import Person from "../src/models/Person.js";
import { generateToken } from "../src/utils/jwt.js";

async function main() {
  console.log("=== STARTING GALLERY SPRINT 3 API VERIFICATION ===");

  await connectDB();

  // Test ObjectIDs
  const userIdA = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a01");
  const userIdB = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a02");
  const photoIdA1 = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d11");
  const photoIdA2 = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d12");
  const photoIdB1 = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d13");

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
  const photoA1 = new Photo({
    _id: photoIdA1,
    userId: userIdA,
    url: "https://example.com/photoA1.jpg",
    cloudinaryPublicId: "apes/photos/photoA1",
    width: 800,
    height: 600,
    status: "completed"
  });
  await photoA1.save();

  const photoA2 = new Photo({
    _id: photoIdA2,
    userId: userIdA,
    url: "https://example.com/photoA2.jpg",
    cloudinaryPublicId: "apes/photos/photoA2",
    width: 800,
    height: 600,
    status: "completed"
  });
  await photoA2.save();

  const photoB1 = new Photo({
    _id: photoIdB1,
    userId: userIdB,
    url: "https://example.com/photoB1.jpg",
    cloudinaryPublicId: "apes/photos/photoB1",
    width: 800,
    height: 600,
    status: "completed"
  });
  await photoB1.save();

  // Seed People
  const personA = new Person({
    userId: userIdA,
    name: "Alice",
    nameNormalized: "alice"
  });
  await personA.save();

  const personB = new Person({
    userId: userIdB,
    name: "Bob",
    nameNormalized: "bob"
  });
  await personB.save();

  // Seed Faces
  // Alice face on photoA1
  const faceA1 = new Face({
    photoId: photoIdA1,
    userId: userIdA,
    personId: personA._id,
    embedding: Array(512).fill(0.1),
    bbox: { x: 10, y: 10, w: 50, h: 50 },
    isLabeled: true
  });
  await faceA1.save();

  // Alice face on photoA2
  const faceA2 = new Face({
    photoId: photoIdA2,
    userId: userIdA,
    personId: personA._id,
    embedding: Array(512).fill(0.1),
    bbox: { x: 20, y: 20, w: 40, h: 40 },
    isLabeled: true
  });
  await faceA2.save();

  // Bob face on photoB1
  const faceB1 = new Face({
    photoId: photoIdB1,
    userId: userIdB,
    personId: personB._id,
    embedding: Array(512).fill(0.2),
    bbox: { x: 30, y: 30, w: 60, h: 60 },
    isLabeled: true
  });
  await faceB1.save();

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
    // TEST 1: GET /api/faces/people
    // ==========================================
    console.log("\n[TEST 1] GET /api/faces/people for User A...");
    const res1 = await clientA.get("/api/faces/people");
    console.log("Status:", res1.status, "Body:", res1.data);
    if (res1.status !== 200) {
      throw new Error(`TEST 1 FAILED: Expected HTTP 200, got ${res1.status}`);
    }
    if (!Array.isArray(res1.data) || res1.data.length !== 1) {
      throw new Error("TEST 1 FAILED: Expected array with 1 person");
    }
    if (res1.data[0].name !== "Alice" || res1.data[0].avatarUrl !== "https://example.com/photoA1.jpg") {
      throw new Error("TEST 1 FAILED: Person details or avatar mapping incorrect");
    }
    console.log("[TEST 1] PASSED.");

    // ==========================================
    // TEST 2: GET /api/faces/people/:personId/photos
    // ==========================================
    console.log("\n[TEST 2] GET /api/faces/people/:personId/photos for Alice...");
    const res2 = await clientA.get(`/api/faces/people/${personA._id}/photos`);
    console.log("Status:", res2.status, "Body photos count:", res2.data?.photos?.length);
    if (res2.status !== 200) {
      throw new Error(`TEST 2 FAILED: Expected HTTP 200, got ${res2.status}`);
    }
    if (res2.data.personName !== "Alice" || !Array.isArray(res2.data.photos) || res2.data.photos.length !== 2) {
      throw new Error("TEST 2 FAILED: Expected 2 photos for Alice");
    }
    console.log("[TEST 2] PASSED.");

    // ==========================================
    // TEST 3: Tenancy boundary checks for getPersonPhotos
    // ==========================================
    console.log("\n[TEST 3] GET /api/faces/people/:personId/photos for Bob using User A's token...");
    const res3 = await clientA.get(`/api/faces/people/${personB._id}/photos`);
    console.log("Status:", res3.status, "Body:", res3.data);
    if (res3.status !== 404) {
      throw new Error(`TEST 3 FAILED: Expected HTTP 404 (or 403), got ${res3.status}`);
    }
    console.log("[TEST 3] PASSED.");

    // ==========================================
    // TEST 4: bulkDeletePhotos - delete A1 and A2
    // ==========================================
    console.log("\n[TEST 4] POST /api/v1/photos/bulk-delete to delete A1 and A2...");
    const res4 = await clientA.post("/api/v1/photos/bulk-delete", {
      ids: [photoIdA1.toString(), photoIdA2.toString()]
    });
    console.log("Status:", res4.status, "Body:", res4.data);
    if (res4.status !== 200) {
      throw new Error(`TEST 4 FAILED: Expected HTTP 200, got ${res4.status}`);
    }

    // Verify photos and their face coordinates are deleted from DB
    const dbPhotos = await Photo.find({ _id: { $in: [photoIdA1, photoIdA2] } });
    if (dbPhotos.length !== 0) {
      throw new Error("TEST 4 FAILED: Photos were not deleted from DB");
    }
    const dbFaces = await Face.find({ photoId: { $in: [photoIdA1, photoIdA2] } });
    if (dbFaces.length !== 0) {
      throw new Error("TEST 4 FAILED: Associated Face coordinates were not deleted from DB");
    }
    console.log("[TEST 4] PASSED.");

    // ==========================================
    // TEST 5: Tenancy boundary check for bulkDeletePhotos
    // ==========================================
    console.log("\n[TEST 5] POST /api/v1/photos/bulk-delete to delete Bob's photo (B1) using User A's token...");
    // Reset seed for B1
    const photoB1Reset = await Photo.findById(photoIdB1);
    if (!photoB1Reset) {
      throw new Error("Setup error: Photo B1 not found");
    }
    const res5 = await clientA.post("/api/v1/photos/bulk-delete", {
      ids: [photoIdB1.toString()]
    });
    console.log("Status:", res5.status, "Body:", res5.data);
    if (res5.status !== 403) {
      throw new Error(`TEST 5 FAILED: Expected HTTP 403, got ${res5.status}`);
    }
    
    // Bob's photo should still exist in database
    const dbPhotoB1 = await Photo.findById(photoIdB1);
    if (!dbPhotoB1) {
      throw new Error("TEST 5 FAILED: Bob's photo was deleted by User A!");
    }
    console.log("[TEST 5] PASSED.");

    await cleanDb();
    console.log("\n=== ALL SPRINT 3 GALLERY API TESTS PASSED SUCCESSFULLY ===");

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
