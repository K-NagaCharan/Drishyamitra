import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Photo from "../src/models/Photo.js";
import { checkDeliverySize, DeliverySizeError } from "../src/services/deliverySize.service.js";
import { logger } from "../src/config/logger.js";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`Assertion Failed: ${message}`);
    process.exit(1);
  }
};

async function runTests() {
  logger.info("Connecting to database...");
  await connectDB();

  const testUserId = new mongoose.Types.ObjectId();
  const testPhotos = [];

  try {
    // Set up test photo documents
    const p1 = await Photo.create({
      userId: testUserId,
      url: "https://example.com/p1.png",
      cloudinaryPublicId: "p1",
      bytes: 5 * 1024 * 1024, // 5 MB
      status: "completed"
    });
    testPhotos.push(p1);

    const p2 = await Photo.create({
      userId: testUserId,
      url: "https://example.com/p2.png",
      cloudinaryPublicId: "p2",
      bytes: 10 * 1024 * 1024, // 10 MB
      status: "completed"
    });
    testPhotos.push(p2);

    const pLarge = await Photo.create({
      userId: testUserId,
      url: "https://example.com/plarge.png",
      cloudinaryPublicId: "plarge",
      bytes: 30 * 1024 * 1024, // 30 MB (above 25MB threshold)
      status: "completed"
    });
    testPhotos.push(pLarge);

    // Create a document with missing 'bytes' field using mongoose model bypass to avoid schema validation if any
    const pMissing = await Photo.create({
      userId: testUserId,
      url: "https://example.com/pmissing.png",
      cloudinaryPublicId: "pmissing",
      status: "completed"
      // bytes omitted on purpose
    });
    testPhotos.push(pMissing);

    logger.info("Test photo fixtures created successfully.");

    // ----------------------------------------------------
    // Scenario 1: Below Threshold
    // ----------------------------------------------------
    logger.info("--- Scenario 1: Below Threshold ---");
    const res1 = await checkDeliverySize({ photoIds: [p1._id, p2._id] });
    logger.info(res1, "Result for Scenario 1");
    assert(res1.totalBytes === 15 * 1024 * 1024, "Total bytes should be 15 MB");
    assert(res1.count === 2, "Count should be 2");
    assert(res1.exceedsThreshold === false, "Should not exceed threshold");

    // ----------------------------------------------------
    // Scenario 2: Above Threshold
    // ----------------------------------------------------
    logger.info("--- Scenario 2: Above Threshold ---");
    const res2 = await checkDeliverySize({ photoIds: [p1._id, pLarge._id] });
    logger.info(res2, "Result for Scenario 2");
    assert(res2.totalBytes === 35 * 1024 * 1024, "Total bytes should be 35 MB");
    assert(res2.count === 2, "Count should be 2");
    assert(res2.exceedsThreshold === true, "Should exceed threshold");

    // ----------------------------------------------------
    // Scenario 3: Empty Array
    // ----------------------------------------------------
    logger.info("--- Scenario 3: Empty Array ---");
    const res3 = await checkDeliverySize({ photoIds: [] });
    logger.info(res3, "Result for Scenario 3");
    assert(res3.totalBytes === 0, "Total bytes should be 0");
    assert(res3.count === 0, "Count should be 0");
    assert(res3.exceedsThreshold === false, "Should not exceed threshold");

    // ----------------------------------------------------
    // Scenario 4: Invalid Photo ID
    // ----------------------------------------------------
    logger.info("--- Scenario 4: Invalid Photo ID ---");
    try {
      await checkDeliverySize({ photoIds: ["not-a-valid-object-id"] });
      assert(false, "Should have thrown for malformed ID");
    } catch (err) {
      assert(err instanceof DeliverySizeError, "Should throw DeliverySizeError");
      assert(err.message.includes("Invalid photo ID format"), `Error message mismatch: ${err.message}`);
    }

    try {
      await checkDeliverySize({ photoIds: [new mongoose.Types.ObjectId()] });
      assert(false, "Should have thrown for non-existent ID");
    } catch (err) {
      assert(err instanceof DeliverySizeError, "Should throw DeliverySizeError");
      assert(err.message.includes("Some requested photos were not found"), `Error message mismatch: ${err.message}`);
    }

    // ----------------------------------------------------
    // Scenario 5: Missing Bytes Metadata
    // ----------------------------------------------------
    logger.info("--- Scenario 5: Missing Bytes Metadata ---");
    try {
      await checkDeliverySize({ photoIds: [p1._id, pMissing._id] });
      assert(false, "Should have thrown for missing bytes");
    } catch (err) {
      assert(err instanceof DeliverySizeError, "Should throw DeliverySizeError");
      assert(err.message.includes("missing valid size metadata"), `Error message mismatch: ${err.message}`);
    }

    logger.info("ALL TESTS COMPLETED SUCCESSFULLY!");
  } finally {
    // Cleanup fixtures
    logger.info("Cleaning up database fixtures...");
    await Photo.deleteMany({ userId: testUserId });
    await mongoose.disconnect();
    logger.info("Disconnected from MongoDB.");
  }
}

runTests().catch(async (err) => {
  logger.error({ err: err.message, stack: err.stack }, "Tests failed with critical error");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
