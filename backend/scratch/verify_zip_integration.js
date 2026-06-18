import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import redis from "../src/config/redis.js";
import { closeBullMQConnection } from "../src/config/bullmq.js";
import { logger } from "../src/config/logger.js";
import Photo from "../src/models/Photo.js";
import DeliveryHistory from "../src/models/DeliveryHistory.js";
import { execute as sendEmail } from "../src/agent/tools/sendEmail.js";
import { execute as confirmZipDelivery } from "../src/agent/tools/confirmZipDelivery.js";
import { initDeliveryWorker, closeDeliveryWorker, getDeliveryWorker, deliveryHelpers } from "../src/workers/delivery.worker.js";
import { zipHelpers } from "../src/services/zip.service.js";
import { ZipConfirmationError } from "../src/services/zipConfirmation.service.js";
import { env } from "../src/config/env.js";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`Assertion Failed: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
};

async function runTests() {
  logger.info("Initializing DB and Redis connections...");
  await connectDB();

  const testUserId = new mongoose.Types.ObjectId().toString();

  // Create mock photo records in DB
  const smallPhoto = await Photo.create({
    userId: testUserId,
    url: "mock://photo/small.png",
    cloudinaryPublicId: "small_photo",
    bytes: 1000,
    status: "completed",
    uploadDate: new Date()
  });

  const largePhoto = await Photo.create({
    userId: testUserId,
    url: "mock://photo/large.png",
    cloudinaryPublicId: "large_photo",
    bytes: 30000000, // 30MB, exceeds default 25MB threshold
    status: "completed",
    uploadDate: new Date()
  });

  const emittedEvents = [];
  const spyEmitter = {
    to(room) {
      return {
        emit(event, payload) {
          logger.info({ event, payload, room }, "Captured event emission spy");
          emittedEvents.push({ room: room.toString(), event, payload });
        }
      };
    }
  };

  // Start the delivery worker with the spy emitter
  initDeliveryWorker(spyEmitter);
  const worker = getDeliveryWorker();

  // Keep track of original functions for restoration
  const originalSendEmail = deliveryHelpers.sendEmail;
  const originalCreateZip = zipHelpers.createZip;

  try {
    // ----------------------------------------------------
    // Scenario 1: Small Delivery Flow
    // ----------------------------------------------------
    logger.info("--- Scenario 1: Small Delivery (Immediate) ---");
    
    // Stub sendEmail to simulate success
    deliveryHelpers.sendEmail = async ({ recipient, subject, photos, zipUrl }) => {
      logger.info({ recipient, subject, photosCount: photos.length, zipUrl }, "Stubbed sendEmail called");
      assert(!zipUrl, "Small delivery should not contain zipUrl");
      return {
        messageId: "mock-email-message-id-small",
        recipient,
        timestamp: new Date()
      };
    };

    const smallResult = await sendEmail(
      { email: "recipient@example.com", photoIds: [smallPhoto._id.toString()] },
      testUserId
    );
    assert(smallResult.success === true, "Small delivery should succeed enqueuing");
    assert(smallResult.message.includes("Request ID"), "Response should contain Request ID");

    // Extract delivery ID
    const match = smallResult.message.match(/Request ID:\s*([a-f\d]{24})/i);
    const smallDeliveryId = match ? match[1] : null;
    assert(smallDeliveryId, "Failed to parse delivery ID");

    // Wait for worker to complete the job
    const jobDonePromise1 = new Promise((resolve) => {
      worker.once("completed", (job) => {
        if (job.data.requestId === smallDeliveryId) {
          resolve(job);
        }
      });
    });

    await jobDonePromise1;
    await new Promise((resolve) => setTimeout(resolve, 800)); // wait for database write to settle

    // Verify DeliveryHistory is updated
    const updatedSmallRecord = await DeliveryHistory.findById(smallDeliveryId);
    assert(updatedSmallRecord.status === "delivered", "Record status should be delivered");
    assert(updatedSmallRecord.format === "links", "Record format should be links");
    assert(updatedSmallRecord.count === 1, "Record count should be 1");
    assert(updatedSmallRecord.messageId === "mock-email-message-id-small", "Record messageId mismatch");
    logger.info("Scenario 1 passed.");

    // ----------------------------------------------------
    // Scenario 2: Large Delivery Requiring Confirmation Flow
    // ----------------------------------------------------
    logger.info("--- Scenario 2: Large Delivery (Requires Confirmation) ---");

    const largeResult = await sendEmail(
      { email: "recipient@example.com", photoIds: [largePhoto._id.toString()] },
      testUserId
    );

    assert(largeResult.requiresConfirmation === true, "Large delivery should require confirmation");
    assert(largeResult.sessionId && typeof largeResult.sessionId === "string", "Should return a sessionId");
    assert(largeResult.totalBytes === 30000000, "Should report totalBytes");
    assert(largeResult.count === 1, "Should report count");

    // Verify NO delivery history was created in status 'queued' yet for this flow
    const recordsCountBefore = await DeliveryHistory.countDocuments({ userId: testUserId, format: "zip" });
    assert(recordsCountBefore === 0, "No ZIP delivery history records should exist yet");
    logger.info("Scenario 2 passed.");

    // Store sessionId for Scenario 3
    const activeSessionId = largeResult.sessionId;

    // ----------------------------------------------------
    // Scenario 3: Confirmation Accepted Flow
    // ----------------------------------------------------
    logger.info("--- Scenario 3: Confirmation Accepted Flow ---");

    // Stub createZip to return success
    zipHelpers.createZip = async ({ photos }) => {
      logger.info({ count: photos.length }, "Stubbed createZip called");
      return {
        zipUrl: "https://cloudinary/mock-zip-archive.zip",
        cloudinaryPublicId: "drishyamitra/deliveries/mock-zip-archive",
        fileSize: 15000000,
        photoCount: photos.length
      };
    };

    // Stub sendEmail to handle ZIP URL
    deliveryHelpers.sendEmail = async ({ recipient, subject, photos, zipUrl }) => {
      logger.info({ recipient, subject, photosCount: photos.length, zipUrl }, "Stubbed sendEmail ZIP called");
      assert(zipUrl === "https://cloudinary/mock-zip-archive.zip", "Should pass correct zipUrl");
      return {
        messageId: "mock-email-message-id-zip",
        recipient,
        timestamp: new Date()
      };
    };

    // Call confirmation tool
    const confirmResult = await confirmZipDelivery(
      { sessionId: activeSessionId, confirmed: true },
      testUserId
    );

    assert(confirmResult.success === true, "Confirmation execution should return success");
    assert(confirmResult.confirmed === true, "Should report confirmed: true");
    assert(confirmResult.deliveryId && typeof confirmResult.deliveryId === "string", "Should return deliveryId");
    assert(confirmResult.zipUrl === "https://cloudinary/mock-zip-archive.zip", "Should return zipUrl");

    const zipDeliveryId = confirmResult.deliveryId;

    // Verify record state BEFORE worker processes it (directly after confirm Zip delivery returns)
    const initialZipRecord = await DeliveryHistory.findById(zipDeliveryId);
    assert(initialZipRecord, "DeliveryHistory record must exist");
    assert(initialZipRecord.status === "queued", "Record status should start as queued");
    assert(initialZipRecord.format === "zip", "Record format should be zip");
    assert(initialZipRecord.zipUrl === "https://cloudinary/mock-zip-archive.zip", "Record zipUrl should be saved");
    assert(initialZipRecord.cloudinaryPublicId === "drishyamitra/deliveries/mock-zip-archive", "Record public ID should be saved");

    // Wait for worker to complete the job
    const jobDonePromise2 = new Promise((resolve) => {
      worker.once("completed", (job) => {
        if (job.data.requestId === zipDeliveryId) {
          resolve(job);
        }
      });
    });

    await jobDonePromise2;
    await new Promise((resolve) => setTimeout(resolve, 800)); // wait for database write to settle

    // Verify DeliveryHistory is updated correctly to status 'delivered'
    const finalZipRecord = await DeliveryHistory.findById(zipDeliveryId);
    assert(finalZipRecord.status === "delivered", "Record status should be updated to delivered");
    assert(finalZipRecord.format === "zip", "Record format should remain zip");
    assert(finalZipRecord.zipUrl === "https://cloudinary/mock-zip-archive.zip", "Record zipUrl must be preserved");
    assert(finalZipRecord.cloudinaryPublicId === "drishyamitra/deliveries/mock-zip-archive", "Record public ID must be preserved");
    assert(finalZipRecord.messageId === "mock-email-message-id-zip", "Record messageId mismatch");
    logger.info("Scenario 3 passed.");

    // ----------------------------------------------------
    // Scenario 4: Confirmation Rejected Flow
    // ----------------------------------------------------
    logger.info("--- Scenario 4: Confirmation Rejected Flow ---");
    
    // Create a new session first
    const rejectedSession = await sendEmail(
      { email: "recipient@example.com", photoIds: [largePhoto._id.toString()] },
      testUserId
    );

    // Call cancel
    const rejectResult = await confirmZipDelivery(
      { sessionId: rejectedSession.sessionId, confirmed: false },
      testUserId
    );

    assert(rejectResult.success === true, "Reject should return success");
    assert(rejectResult.confirmed === false, "Should report confirmed: false");
    
    // Check that calling cancel again on same ID is idempotent and doesn't throw
    const rejectResultDuplicate = await confirmZipDelivery(
      { sessionId: rejectedSession.sessionId, confirmed: false },
      testUserId
    );
    assert(rejectResultDuplicate.success === true, "Duplicate reject should return success");

    // Try to confirm the rejected session, should throw SESSION_NOT_FOUND since it was deleted
    try {
      await confirmZipDelivery(
        { sessionId: rejectedSession.sessionId, confirmed: true },
        testUserId
      );
      assert(false, "Should have thrown for already rejected session");
    } catch (err) {
      assert(err instanceof ZipConfirmationError, "Should throw ZipConfirmationError");
      assert(err.code === "SESSION_NOT_FOUND", `Expected SESSION_NOT_FOUND, got ${err.code}`);
    }
    logger.info("Scenario 4 passed.");

    // ----------------------------------------------------
    // Scenario 5: Expired Session Flow
    // ----------------------------------------------------
    logger.info("--- Scenario 5: Expired Session Flow ---");
    
    // Create a new session first
    const expiredSession = await sendEmail(
      { email: "recipient@example.com", photoIds: [largePhoto._id.toString()] },
      testUserId
    );

    // Manually set logical expiresAt in Redis to the past
    const expiredPayload = {
      userId: testUserId,
      medium: "email",
      recipient: "recipient@example.com",
      photoIds: [largePhoto._id.toString()],
      totalBytes: 30000000,
      count: 1,
      createdAt: new Date(Date.now() - 20000).toISOString(),
      expiresAt: new Date(Date.now() - 10000).toISOString() // logically expired
    };
    await redis.set(`zip:confirmation:${expiredSession.sessionId}`, JSON.stringify(expiredPayload), "EX", 300);

    // Try to confirm, should throw SESSION_EXPIRED
    try {
      await confirmZipDelivery(
        { sessionId: expiredSession.sessionId, confirmed: true },
        testUserId
      );
      assert(false, "Should have thrown SESSION_EXPIRED");
    } catch (err) {
      assert(err instanceof ZipConfirmationError, "Should throw ZipConfirmationError");
      assert(err.code === "SESSION_EXPIRED", `Expected SESSION_EXPIRED, got ${err.code}`);
    }

    // Key should have been deleted from Redis
    const checkExpiredDeleted = await redis.get(`zip:confirmation:${expiredSession.sessionId}`);
    assert(!checkExpiredDeleted, "Key must be deleted after expired confirm attempt");
    logger.info("Scenario 5 passed.");

    // ----------------------------------------------------
    // Scenario 6: ZIP Creation Failure Flow
    // ----------------------------------------------------
    logger.info("--- Scenario 6: ZIP Creation Failure Flow ---");
    
    // Create a new session first
    const failedZipSession = await sendEmail(
      { email: "recipient@example.com", photoIds: [largePhoto._id.toString()] },
      testUserId
    );

    // Stub createZip to throw error
    zipHelpers.createZip = async () => {
      throw new Error("Failed to compile ZIP: Cloudinary connection timeout");
    };

    let failedZipDeliveryId = null;
    try {
      await confirmZipDelivery(
        { sessionId: failedZipSession.sessionId, confirmed: true },
        testUserId
      );
      assert(false, "Should have thrown zip compilation error");
    } catch (err) {
      assert(err.message.includes("Failed to compile ZIP"), "Should throw correct error message");
    }

    // Find the record created for this session
    const failedZipRecord = await DeliveryHistory.findOne({
      userId: testUserId,
      format: "zip",
      status: "failed"
    });
    assert(failedZipRecord, "Failed ZIP creation record must exist in status failed");
    assert(failedZipRecord.error.includes("Failed to compile ZIP"), "Should save error description in-place");
    logger.info("Scenario 6 passed.");

    // ----------------------------------------------------
    // Scenario 7: Delivery Failure after ZIP Creation Flow
    // ----------------------------------------------------
    logger.info("--- Scenario 7: Delivery Failure after ZIP Creation Flow ---");
    
    // Restore createZip to succeed
    zipHelpers.createZip = async ({ photos }) => {
      return {
        zipUrl: "https://cloudinary/mock-zip-error.zip",
        cloudinaryPublicId: "drishyamitra/deliveries/mock-zip-error",
        fileSize: 15000000,
        photoCount: photos.length
      };
    };

    // Stub sendEmail to throw delivery failure
    deliveryHelpers.sendEmail = async () => {
      throw new Error("SMTP authentication credentials rejected");
    };

    // Create session
    const finalSession = await sendEmail(
      { email: "recipient@example.com", photoIds: [largePhoto._id.toString()] },
      testUserId
    );

    // Call confirm
    const finalConfirm = await confirmZipDelivery(
      { sessionId: finalSession.sessionId, confirmed: true },
      testUserId
    );
    const finalDeliveryId = finalConfirm.deliveryId;

    // Wait for worker to report job failure
    const jobFailedPromise = new Promise((resolve) => {
      worker.once("failed", (job, err) => {
        if (job.data.requestId === finalDeliveryId) {
          resolve({ job, err });
        }
      });
    });

    await jobFailedPromise;
    await new Promise((resolve) => setTimeout(resolve, 800)); // wait for database write to settle

    // Verify record state updated to 'failed' in-place
    const failedDeliveryRecord = await DeliveryHistory.findById(finalDeliveryId);
    assert(failedDeliveryRecord.status === "failed", "Record status should be failed");
    assert(failedDeliveryRecord.error.includes("SMTP authentication credentials rejected"), "Should save error details");
    logger.info("Scenario 7 passed.");

    logger.info("ALL INTEGRATION TESTS COMPLETED AND PASSED SUCCESSFULLY!");

  } finally {
    // Restore all stubs
    deliveryHelpers.sendEmail = originalSendEmail;
    zipHelpers.createZip = originalCreateZip;

    // Cleanup
    logger.info("Cleaning up mock database records...");
    await Photo.deleteMany({ userId: testUserId });
    await DeliveryHistory.deleteMany({ userId: testUserId });
    await closeDeliveryWorker();
    await redis.quit();
    await closeBullMQConnection();
    await mongoose.disconnect();
    logger.info("Clean shutdown complete.");
  }
}

runTests().catch(async (err) => {
  logger.error({ err: err.message, stack: err.stack }, "E2E integration test suite failed");
  await closeDeliveryWorker().catch(() => {});
  await redis.quit().catch(() => {});
  await closeBullMQConnection().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
