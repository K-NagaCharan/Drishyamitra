import mongoose from "mongoose";
import axios from "axios";
import AdmZip from "adm-zip";
import { connectDB } from "../src/config/db.js";
import Photo from "../src/models/Photo.js";
import { createZip, ZipServiceError } from "../src/services/zip.service.js";
import { uploadStream, deleteAsset } from "../src/services/photo.service.js";
import cloudinary from "../src/config/cloudinary.js";
import { logger } from "../src/config/logger.js";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`Assertion Failed: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
};

// Tracking lists for cleanup
const assetsToCleanUp = []; // { publicId, resourceType }
const dbPhotosToCleanUp = []; // mongoose.Types.ObjectId

async function registerTestAsset(publicId, resourceType = "image") {
  assetsToCleanUp.push({ publicId, resourceType });
}

async function registerDbPhoto(photoId) {
  dbPhotosToCleanUp.push(photoId);
}

// Helper to clean up all tracked assets
async function performCleanup() {
  logger.info("Starting cleanup of test assets and database records...");

  // Clean up DB photos
  if (dbPhotosToCleanUp.length > 0) {
    try {
      const result = await Photo.deleteMany({ _id: { $in: dbPhotosToCleanUp } });
      logger.info(`Deleted ${result.deletedCount} Photo documents from database.`);
      dbPhotosToCleanUp.length = 0;
    } catch (err) {
      logger.error({ err: err.message }, "Error cleaning up Photo documents");
    }
  }

  // Clean up Cloudinary assets
  for (const asset of assetsToCleanUp) {
    try {
      logger.info(`Deleting asset ${asset.publicId} (${asset.resourceType}) from Cloudinary...`);
      if (asset.resourceType === "raw") {
        await cloudinary.uploader.destroy(asset.publicId, { resource_type: "raw" });
      } else {
        await deleteAsset(asset.publicId);
      }
      logger.info(`Deleted ${asset.publicId} successfully.`);
    } catch (err) {
      logger.error({ err: err.message }, `Failed to delete Cloudinary asset ${asset.publicId}`);
    }
  }
  assetsToCleanUp.length = 0;
}

// 1x1 Pixel Transparent PNG buffer
const dummyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

async function runTests() {
  logger.info("Connecting to MongoDB database...");
  await connectDB();
  logger.info("Connected to database successfully.");

  const testUserId = new mongoose.Types.ObjectId();

  try {
    // ----------------------------------------------------
    // Scenario 1: Empty and invalid inputs validation
    // ----------------------------------------------------
    logger.info("--- Scenario 1: Empty and invalid inputs validation ---");
    try {
      await createZip({ photos: null });
      assert(false, "Should have thrown for null photos");
    } catch (err) {
      assert(err instanceof ZipServiceError, "Should throw ZipServiceError");
      assert(err.code === "INVALID_INPUT", `Expected INVALID_INPUT code, got ${err.code}`);
    }

    try {
      await createZip({ photos: [] });
      assert(false, "Should have thrown for empty photos array");
    } catch (err) {
      assert(err instanceof ZipServiceError, "Should throw ZipServiceError");
      assert(err.code === "INVALID_INPUT", `Expected INVALID_INPUT code, got ${err.code}`);
    }

    try {
      await createZip({ photos: [{ url: "" }] });
      assert(false, "Should have thrown for malformed photo object");
    } catch (err) {
      assert(err instanceof ZipServiceError, "Should throw ZipServiceError");
      assert(err.code === "INVALID_INPUT", `Expected INVALID_INPUT code, got ${err.code}`);
    }
    logger.info("Scenario 1 passed.");

    // ----------------------------------------------------
    // Scenario 2: Invalid image URL (broken/404)
    // ----------------------------------------------------
    logger.info("--- Scenario 2: Invalid image URL download failure ---");
    const brokenPhotos = [
      {
        _id: new mongoose.Types.ObjectId(),
        url: "https://httpstat.us/404/non-existent-image.jpg"
      }
    ];
    try {
      await createZip({ photos: brokenPhotos });
      assert(false, "Should have thrown for 404 URL");
    } catch (err) {
      assert(err instanceof ZipServiceError, "Should throw ZipServiceError");
      assert(err.code === "DOWNLOAD_FAILURE", `Expected DOWNLOAD_FAILURE code, got ${err.code}`);
      assert(err.details.photoId.toString() === brokenPhotos[0]._id.toString(), "Should include failed photoId");
      assert(err.details.url === brokenPhotos[0].url, "Should include failed URL");
    }
    logger.info("Scenario 2 passed.");

    // ----------------------------------------------------
    // Scenario 3: Happy Path (Small Collection)
    // ----------------------------------------------------
    logger.info("--- Scenario 3: Happy Path (2 Photos) ---");
    logger.info("Uploading 2 mock photos to Cloudinary...");
    const uploadRes1 = await uploadStream(dummyPng);
    await registerTestAsset(uploadRes1.public_id, "image");
    const uploadRes2 = await uploadStream(dummyPng);
    await registerTestAsset(uploadRes2.public_id, "image");

    const p1 = await Photo.create({
      userId: testUserId,
      url: uploadRes1.secure_url,
      cloudinaryPublicId: uploadRes1.public_id,
      bytes: uploadRes1.bytes,
      status: "completed"
    });
    await registerDbPhoto(p1._id);

    const p2 = await Photo.create({
      userId: testUserId,
      url: uploadRes2.secure_url,
      cloudinaryPublicId: uploadRes2.public_id,
      bytes: uploadRes2.bytes,
      status: "completed"
    });
    await registerDbPhoto(p2._id);

    logger.info("Zipping photos...");
    const zipResult = await createZip({ photos: [p1, p2] });
    await registerTestAsset(zipResult.cloudinaryPublicId, "raw");

    logger.info(zipResult, "ZIP Generation Result");
    assert(zipResult.zipUrl && typeof zipResult.zipUrl === "string", "zipUrl should be a string");
    assert(zipResult.cloudinaryPublicId && zipResult.cloudinaryPublicId.startsWith("drishyamitra/deliveries/"), "cloudinaryPublicId should be in deliveries folder");
    assert(zipResult.fileSize > 0, "fileSize should be greater than 0");
    assert(zipResult.photoCount === 2, "photoCount should be 2");

    logger.info(`Downloading zip from ${zipResult.zipUrl}...`);
    const zipDownload = await axios({
      method: "get",
      url: zipResult.zipUrl,
      responseType: "arraybuffer"
    });

    const zip = new AdmZip(Buffer.from(zipDownload.data));
    const zipEntries = zip.getEntries();
    assert(zipEntries.length === 2, "ZIP should contain exactly 2 entries");

    // Check filenames are preserved based on URLs
    const filename1 = uploadRes1.secure_url.substring(uploadRes1.secure_url.lastIndexOf("/") + 1);
    const filename2 = uploadRes2.secure_url.substring(uploadRes2.secure_url.lastIndexOf("/") + 1);
    
    const entryNames = zipEntries.map(e => e.entryName);
    logger.info({ entryNames }, "Filenames inside ZIP");
    assert(entryNames.includes(filename1), `ZIP should contain ${filename1}`);
    assert(entryNames.includes(filename2), `ZIP should contain ${filename2}`);

    logger.info("Scenario 3 passed.");

    // ----------------------------------------------------
    // Scenario 4: Concurrency and Larger Collections
    // ----------------------------------------------------
    logger.info("--- Scenario 4: Concurrency and Larger Collections (10 Photos) ---");
    logger.info("Uploading 10 mock photos to Cloudinary...");
    const largeCollectionPhotos = [];
    for (let i = 0; i < 10; i++) {
      const res = await uploadStream(dummyPng);
      await registerTestAsset(res.public_id, "image");

      const photo = await Photo.create({
        userId: testUserId,
        url: res.secure_url,
        cloudinaryPublicId: res.public_id,
        bytes: res.bytes,
        status: "completed"
      });
      await registerDbPhoto(photo._id);
      largeCollectionPhotos.push(photo);
    }

    logger.info("Zipping large collection with concurrency limit of 3...");
    const largeZipResult = await createZip({ photos: largeCollectionPhotos, concurrencyLimit: 3 });
    await registerTestAsset(largeZipResult.cloudinaryPublicId, "raw");

    logger.info(largeZipResult, "Large Collection ZIP Result");
    assert(largeZipResult.photoCount === 10, "photoCount should be 10");

    logger.info(`Downloading large zip...`);
    const largeZipDownload = await axios({
      method: "get",
      url: largeZipResult.zipUrl,
      responseType: "arraybuffer"
    });

    const largeZip = new AdmZip(Buffer.from(largeZipDownload.data));
    const largeZipEntries = largeZip.getEntries();
    assert(largeZipEntries.length === 10, "Large ZIP should contain exactly 10 entries");
    logger.info("Scenario 4 passed.");

    // ----------------------------------------------------
    // Scenario 5: Resiliency/Cleanup Validation
    // ----------------------------------------------------
    logger.info("--- Scenario 5: Resiliency and Cleanup Validation ---");
    // Upload a photo that will be cleaned up
    const resTemp = await uploadStream(dummyPng);
    await registerTestAsset(resTemp.public_id, "image");

    const pTemp = await Photo.create({
      userId: testUserId,
      url: resTemp.secure_url,
      cloudinaryPublicId: resTemp.public_id,
      bytes: resTemp.bytes,
      status: "completed"
    });
    await registerDbPhoto(pTemp._id);

    // Induce a download failure by adding a bad URL
    const mixedPhotos = [
      pTemp,
      {
        _id: new mongoose.Types.ObjectId(),
        url: "https://httpstat.us/500/error-image.jpg"
      }
    ];

    try {
      await createZip({ photos: mixedPhotos });
      assert(false, "Should have failed zip creation");
    } catch (err) {
      assert(err instanceof ZipServiceError, "Should throw ZipServiceError");
      assert(err.code === "DOWNLOAD_FAILURE", "Should be a download failure");
      logger.info("Zip creation failed as expected.");
    }

    // We do not run performCleanup() here yet because the outer finally block will run it.
    // However, we can verify that the assets are currently registered for cleanup.
    assert(assetsToCleanUp.some(a => a.publicId === resTemp.public_id), "Asset should be registered for cleanup");
    assert(dbPhotosToCleanUp.includes(pTemp._id), "Photo ID should be registered for cleanup");

    logger.info("Scenario 5 verification passed.");
    logger.info("ALL SCENARIOS COMPLETED SUCCESSFULLY!");

  } finally {
    // Perform cleanup for all tests
    await performCleanup();
    await mongoose.disconnect();
    logger.info("Disconnected from MongoDB.");
  }
}

runTests().catch(async (err) => {
  logger.error({ err: err.message, stack: err.stack }, "Verification script encountered a critical error");
  await performCleanup().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
