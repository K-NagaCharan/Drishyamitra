import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import redis from "../src/config/redis.js";
import { closeBullMQConnection } from "../src/config/bullmq.js";
import { logger } from "../src/config/logger.js";
import DeliveryHistory from "../src/models/DeliveryHistory.js";
import { cleanupZipQueue } from "../src/queues/cleanupZip.queue.js";
import {
  initCleanupWorker,
  closeCleanupWorker,
  cleanupHelpers,
  processZipCleanup
} from "../src/workers/cleanupZip.worker.js";
import { env } from "../src/config/env.js";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`Assertion Failed: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
};

async function runTests() {
  logger.info("Initializing DB and Redis connections for cleanup verification...");
  await connectDB();

  const testUserId = new mongoose.Types.ObjectId().toString();
  const originalDestroy = cleanupHelpers.destroyCloudinaryAsset;

  // Set ZIP retention to 24 hours for consistency
  const originalRetention = env.ZIP_RETENTION_HOURS;
  env.ZIP_RETENTION_HOURS = 24;

  try {
    // ----------------------------------------------------
    // Scenario 1: Expired ZIP Deletion
    // ----------------------------------------------------
    logger.info("--- Scenario 1: Expired ZIP Deletion ---");
    
    // Create an expired record (delivered 30 hours ago)
    const expiredRecord = new DeliveryHistory({
      userId: testUserId,
      recipient: "test@example.com",
      medium: "email",
      photoIds: [new mongoose.Types.ObjectId()],
      format: "zip",
      zipUrl: "https://cloudinary/expired-archive.zip",
      cloudinaryPublicId: "drishyamitra/deliveries/expired-archive",
      status: "delivered",
      deliveredAt: new Date(Date.now() - 30 * 60 * 60 * 1000)
    });
    await expiredRecord.save();

    // Stub Cloudinary uploader.destroy success
    cleanupHelpers.destroyCloudinaryAsset = async (publicId) => {
      assert(publicId === "drishyamitra/deliveries/expired-archive", "Should call destroy with correct publicId");
      return { result: "ok" };
    };

    const run1 = await processZipCleanup();
    assert(run1.cleanedCount === 1, `Should clean up 1 record, got ${run1.cleanedCount}`);

    // Verify record was updated in-place (URL/public ID cleared, deletedAt set)
    const checkedRecord1 = await DeliveryHistory.findById(expiredRecord._id);
    assert(checkedRecord1.zipUrl === null, "zipUrl must be cleared");
    assert(checkedRecord1.cloudinaryPublicId === null, "cloudinaryPublicId must be cleared");
    assert(checkedRecord1.zipDeletedAt instanceof Date, "zipDeletedAt must be a Date");
    logger.info("Scenario 1 passed.");

    // ----------------------------------------------------
    // Scenario 2: Non-Expired ZIP Retention
    // ----------------------------------------------------
    logger.info("--- Scenario 2: Non-Expired ZIP Retention ---");

    // Create a non-expired record (delivered 1 hour ago)
    const activeRecord = new DeliveryHistory({
      userId: testUserId,
      recipient: "test@example.com",
      medium: "email",
      photoIds: [new mongoose.Types.ObjectId()],
      format: "zip",
      zipUrl: "https://cloudinary/active-archive.zip",
      cloudinaryPublicId: "drishyamitra/deliveries/active-archive",
      status: "delivered",
      deliveredAt: new Date(Date.now() - 1 * 60 * 60 * 1000)
    });
    await activeRecord.save();

    // Stub destroy to throw if called (should not call destroy for active records)
    cleanupHelpers.destroyCloudinaryAsset = async () => {
      throw new Error("Should not destroy non-expired archives!");
    };

    const run2 = await processZipCleanup();
    assert(run2.cleanedCount === 0, `Should not clean up active record, cleaned: ${run2.cleanedCount}`);

    // Verify record remains intact
    const checkedRecord2 = await DeliveryHistory.findById(activeRecord._id);
    assert(checkedRecord2.zipUrl === "https://cloudinary/active-archive.zip", "Active archive zipUrl must remain");
    assert(checkedRecord2.cloudinaryPublicId === "drishyamitra/deliveries/active-archive", "Active archive public ID must remain");
    assert(checkedRecord2.zipDeletedAt === undefined || checkedRecord2.zipDeletedAt === null, "Active record zipDeletedAt must not be set");
    logger.info("Scenario 2 passed.");

    // ----------------------------------------------------
    // Scenario 3: Missing Cloudinary Asset
    // ----------------------------------------------------
    logger.info("--- Scenario 3: Missing Cloudinary Asset ---");

    // Create an expired record
    const missingAssetRecord = new DeliveryHistory({
      userId: testUserId,
      recipient: "test@example.com",
      medium: "email",
      photoIds: [new mongoose.Types.ObjectId()],
      format: "zip",
      zipUrl: "https://cloudinary/missing-archive.zip",
      cloudinaryPublicId: "drishyamitra/deliveries/missing-archive",
      status: "delivered",
      deliveredAt: new Date(Date.now() - 30 * 60 * 60 * 1000)
    });
    await missingAssetRecord.save();

    // Stub Cloudinary uploader.destroy to return not found
    cleanupHelpers.destroyCloudinaryAsset = async (publicId) => {
      assert(publicId === "drishyamitra/deliveries/missing-archive", "Should call with correct publicId");
      return { result: "not found" };
    };

    const run3 = await processZipCleanup();
    assert(run3.cleanedCount === 1, `Should clean up 1 record, got ${run3.cleanedCount}`);

    // Verify record was updated anyway
    const checkedRecord3 = await DeliveryHistory.findById(missingAssetRecord._id);
    assert(checkedRecord3.zipUrl === null, "zipUrl must be cleared even if not found");
    assert(checkedRecord3.cloudinaryPublicId === null, "public ID must be cleared even if not found");
    assert(checkedRecord3.zipDeletedAt instanceof Date, "zipDeletedAt must be set");
    logger.info("Scenario 3 passed.");

    // ----------------------------------------------------
    // Scenario 4: Transient Cloudinary Failure with Retry
    // ----------------------------------------------------
    logger.info("--- Scenario 4: Transient Cloudinary Failure with Retry ---");

    // Create expired record
    const retryRecord = new DeliveryHistory({
      userId: testUserId,
      recipient: "test@example.com",
      medium: "email",
      photoIds: [new mongoose.Types.ObjectId()],
      format: "zip",
      zipUrl: "https://cloudinary/retry-archive.zip",
      cloudinaryPublicId: "drishyamitra/deliveries/retry-archive",
      status: "delivered",
      deliveredAt: new Date(Date.now() - 30 * 60 * 60 * 1000)
    });
    await retryRecord.save();

    // Set up cleanup worker
    const worker = initCleanupWorker();

    let attempts = 0;
    cleanupHelpers.destroyCloudinaryAsset = async (publicId) => {
      attempts++;
      if (attempts === 1) {
        logger.info("Simulating transient network error...");
        throw new Error("EAI_AGAIN: DNS lookup failed");
      }
      logger.info("Retry attempt succeeds!");
      return { result: "ok" };
    };

    const jobCompletedPromise = new Promise((resolve) => {
      worker.once("completed", (job) => {
        resolve(job);
      });
    });

    // Manually add the job to the queue
    await cleanupZipQueue.add("cleanup-expired-zips", {}, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 500
      }
    });

    await jobCompletedPromise;
    await new Promise((resolve) => setTimeout(resolve, 800)); // wait for DB write

    // Verify the record was successfully cleaned up on retry
    const checkedRecord4 = await DeliveryHistory.findById(retryRecord._id);
    assert(checkedRecord4.zipUrl === null, "zipUrl should be cleared on successful retry");
    assert(checkedRecord4.zipDeletedAt instanceof Date, "zipDeletedAt must be set on successful retry");
    assert(attempts === 2, `Should succeed on attempt #2, attempts made: ${attempts}`);
    logger.info("Scenario 4 passed.");

    // ----------------------------------------------------
    // Scenario 5: Idempotent Repeated Cleanup Runs
    // ----------------------------------------------------
    logger.info("--- Scenario 5: Idempotent Repeated Cleanup Runs ---");
    
    // Stub destroy to fail if called (since there should be no expired records remaining)
    cleanupHelpers.destroyCloudinaryAsset = async () => {
      throw new Error("Should not call destroy on idempotent run");
    };

    const run5 = await processZipCleanup();
    assert(run5.cleanedCount === 0, `Should clean up 0 records, got ${run5.cleanedCount}`);
    logger.info("Scenario 5 passed.");

    logger.info("ALL CLEANUP WORKER TESTS COMPLETED AND PASSED SUCCESSFULLY!");

  } finally {
    // Restore
    cleanupHelpers.destroyCloudinaryAsset = originalDestroy;
    if (originalRetention !== undefined) {
      env.ZIP_RETENTION_HOURS = originalRetention;
    }

    // Cleanup DB records
    logger.info("Cleaning up mock database records...");
    await DeliveryHistory.deleteMany({ userId: testUserId });
    await closeCleanupWorker();
    await redis.quit();
    await closeBullMQConnection();
    await mongoose.disconnect();
    logger.info("Clean shutdown complete.");
  }
}

runTests().catch(async (err) => {
  logger.error({ err: err.message, stack: err.stack }, "Cleanup worker verification failed");
  await closeCleanupWorker().catch(() => {});
  await redis.quit().catch(() => {});
  await closeBullMQConnection().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
