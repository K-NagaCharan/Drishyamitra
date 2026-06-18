import app from "../src/app.js";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/config/logger.js";
import User from "../src/models/User.js";
import Photo from "../src/models/Photo.js";
import { env } from "../src/config/env.js";
import * as photoService from "../src/services/photo.service.js";

process.env.ALLOW_MOCK_CLOUDINARY = "true";

// A small 1x1 transparent PNG image in base64
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const validImageBuffer = Buffer.from(pngBase64, "base64");

// Photo service utilizes internal fallback mocks if environment secrets are unconfigured.

const runVerification = async () => {
  logger.info("Starting Photo Upload Pipeline verification tests...");

  // Setup DB
  await connectDB();

  // Clear previous test users if any
  const emailA = "tester_photo_a@drishyamitra.com";
  const emailB = "tester_photo_b@drishyamitra.com";
  await User.deleteMany({ email: { $in: [emailA, emailB] } });

  // Start temporary server
  const testPort = 5001;
  const server = app.listen(testPort, () => {
    logger.info(`Verification server running on port ${testPort}`);
  });

  const authUrl = `http://localhost:${testPort}/api/v1/auth`;
  const photosUrl = `http://localhost:${testPort}/api/v1/photos`;

  try {
    let tokenA = "";
    let tokenB = "";
    let photoId = "";

    // -------------------------------------------------------------
    // SETUP: Register two distinct users
    // -------------------------------------------------------------
    logger.info("--- Setup: Registering Test Users A and B ---");
    const regResA = await fetch(`${authUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "UserA", email: emailA, password: "securePassword123" })
    });
    const regDataA = await regResA.json();
    tokenA = regDataA.data.token;

    const regResB = await fetch(`${authUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "UserB", email: emailB, password: "securePassword123" })
    });
    const regDataB = await regResB.json();
    tokenB = regDataB.data.token;

    logger.info("PASSED: Users A and B registered successfully.");

    // -------------------------------------------------------------
    // TEST 1: Upload Valid Image (User A)
    // -------------------------------------------------------------
    logger.info("--- Test 1: Upload Valid PNG Image (User A) ---");
    const formData = new FormData();
    const blob = new Blob([validImageBuffer], { type: "image/png" });
    formData.append("file", blob, "test_image.png");

    const uploadRes = await fetch(`${photosUrl}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formData
    });

    const uploadData = await uploadRes.json();
    if (uploadRes.status !== 201 || !uploadData.success) {
      throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
    }

    photoId = uploadData.data.photo.id;
    if (!uploadData.data.photo.url || uploadData.data.photo.status !== "completed") {
      throw new Error(`Invalid metadata response structure: ${JSON.stringify(uploadData)}`);
    }

    logger.info("PASSED: Valid photo upload succeeded, and metadata was persisted.");

    // -------------------------------------------------------------
    // TEST 2: Reject Invalid Mimetype (User A)
    // -------------------------------------------------------------
    logger.info("--- Test 2: Reject Malformed Mimetype (Text file) ---");
    const txtFormData = new FormData();
    const txtBlob = new Blob([Buffer.from("dummy plain text contents")], { type: "text/plain" });
    txtFormData.append("file", txtBlob, "not_an_image.txt");

    const badMimeRes = await fetch(`${photosUrl}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: txtFormData
    });

    const badMimeData = await badMimeRes.json();
    if (badMimeRes.status !== 400 || badMimeData.success) {
      throw new Error("Incorrectly accepted non-image mimetype.");
    }
    logger.info("PASSED: Text file upload rejected with 400 status.");

    // -------------------------------------------------------------
    // TEST 3: Reject Oversized File (User A)
    // -------------------------------------------------------------
    logger.info("--- Test 3: Reject Oversized Image File (>10MB) ---");
    const hugeFormData = new FormData();
    const hugeBlob = new Blob([Buffer.alloc(11 * 1024 * 1024)], { type: "image/png" });
    hugeFormData.append("file", hugeBlob, "huge_image.png");

    const hugeRes = await fetch(`${photosUrl}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: hugeFormData
    });

    const hugeData = await hugeRes.json();
    if (hugeRes.status !== 400 || hugeData.success || !hugeData.message.includes("limit")) {
      throw new Error(`Accepted oversized file or bad warning payload: ${JSON.stringify(hugeData)}`);
    }
    logger.info("PASSED: Oversized image file rejected with 400 size limit alert.");

    // -------------------------------------------------------------
    // TEST 4: Fetch User A Photos
    // -------------------------------------------------------------
    logger.info("--- Test 4: Retrieve User A Photo Feeds ---");
    const getResA = await fetch(photosUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const getDataA = await getResA.json();

    if (getResA.status !== 200 || !getDataA.success || getDataA.data.photos.length !== 1) {
      throw new Error(`Failed to list User A photos: ${JSON.stringify(getDataA)}`);
    }
    logger.info("PASSED: Successfully listed user's photos chronologically.");

    // -------------------------------------------------------------
    // TEST 5: Verify User Scopes Isolation (User B)
    // -------------------------------------------------------------
    logger.info("--- Test 5: Scoping Check (User B lists photos) ---");
    const getResB = await fetch(photosUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const getDataB = await getResB.json();

    if (getResB.status !== 200 || getDataB.data.photos.length !== 0) {
      throw new Error(`Isolation check failed: User B retrieved User A's photo: ${JSON.stringify(getDataB)}`);
    }
    logger.info("PASSED: Isolation scope works. User B cannot see User A's photo.");

    // -------------------------------------------------------------
    // TEST 6: Reject Deletion by Unauthorized User (User B)
    // -------------------------------------------------------------
    logger.info("--- Test 6: Unauthorized Delete Block (User B deletes User A's photo) ---");
    const badDeleteRes = await fetch(`${photosUrl}/${photoId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const badDeleteData = await badDeleteRes.json();
    if (badDeleteRes.status !== 403 || badDeleteData.success) {
      throw new Error("Allowed unauthorized deletion of another user's image.");
    }
    logger.info("PASSED: Deletion blocked with 403 Forbidden on ownership mismatch.");

    // -------------------------------------------------------------
    // TEST 7: Successful Deletion (User A)
    // -------------------------------------------------------------
    logger.info("--- Test 7: Authorized Delete Photo (User A) ---");
    const goodDeleteRes = await fetch(`${photosUrl}/${photoId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const goodDeleteData = await goodDeleteRes.json();
    if (goodDeleteRes.status !== 200 || !goodDeleteData.success) {
      throw new Error(`Delete request failed: ${JSON.stringify(goodDeleteData)}`);
    }
    logger.info("PASSED: Owned photo deletion completed successfully.");

    // -------------------------------------------------------------
    // TEST 8: Verify Deletion in DB and Fetch list
    // -------------------------------------------------------------
    logger.info("--- Test 8: Assert DB Record Removal ---");
    const docCheck = await Photo.findById(photoId);
    if (docCheck) {
      throw new Error("MongoDB Photo record was not deleted.");
    }

    const checkListRes = await fetch(photosUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const checkListData = await checkListRes.json();
    if (checkListData.data.photos.length !== 0) {
      throw new Error("Deleted photo still appears in user's photos listing feed.");
    }
    logger.info("PASSED: Document deleted from MongoDB and removed from user listing feeds.");

    // -------------------------------------------------------------
    // TEST 9: Cloudinary Upload Failure handling
    // -------------------------------------------------------------
    logger.info("--- Test 9: Cloudinary Upload Failure Simulation ---");
    process.env.FORCE_CLOUDINARY_ERROR = "true";

    const failUploadRes = await fetch(`${photosUrl}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formData
    });

    const failUploadData = await failUploadRes.json();
    process.env.FORCE_CLOUDINARY_ERROR = "false"; // Reset immediately

    if (failUploadRes.status !== 500 || failUploadData.success) {
      throw new Error(`Upload failure test should return 500 status: ${JSON.stringify(failUploadData)}`);
    }

    // Assert no photo document was created in MongoDB
    const postFailCount = await Photo.countDocuments({ userId: regDataA.data.user.id });
    if (postFailCount !== 0) {
      throw new Error(`DB record was created despite Cloudinary upload failure. Photo Count: ${postFailCount}`);
    }

    logger.info("PASSED: Cloudinary upload failure correctly returned 500 status and created no database records.");

    logger.info("ALL PHOTO PIPELINE INTEGRATION TESTS PASSED SUCCESSFULLY!");

  } finally {
    logger.info("Cleaning up database test documents...");
    await User.deleteMany({ email: { $in: [emailA, emailB] } });

    server.close(() => {
      logger.info("Verification server closed.");
    });

    await mongoose.connection.close();
    logger.info("Database connection closed.");
  }
};

runVerification().catch((err) => {
  logger.error(err, "CRITICAL: Photo verification run failed with error");
  mongoose.connection.close();
  process.exit(1);
});
