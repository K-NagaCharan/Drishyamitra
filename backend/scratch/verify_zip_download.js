import mongoose from "mongoose";
import axios from "axios";
import { connectDB } from "../src/config/db.js";
import DeliveryHistory from "../src/models/DeliveryHistory.js";
import cloudinary from "../src/config/cloudinary.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../src/config/logger.js";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`Assertion Failed: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
};

async function runTests() {
  logger.info("Connecting to MongoDB database...");
  await connectDB();
  logger.info("Connected successfully.");

  const dummyBuffer = Buffer.from("verify_zip_download dummy contents");
  const fileUuid = uuidv4();
  const zipFilename = `delivery-${fileUuid}`; // extensionless public ID

  logger.info("Uploading dummy raw asset to Cloudinary...");
  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "drishyamitra/deliveries",
        public_id: zipFilename,
        resource_type: "raw"
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(dummyBuffer);
  });
  logger.info(`Uploaded: ${uploadResult.secure_url}`);

  const testUserId = new mongoose.Types.ObjectId();
  const deliveryRecord = new DeliveryHistory({
    userId: testUserId,
    recipient: "verify@test.com",
    medium: "email",
    photoIds: [new mongoose.Types.ObjectId()],
    format: "zip",
    zipUrl: uploadResult.secure_url,
    cloudinaryPublicId: uploadResult.public_id,
    status: "delivered",
    deliveredAt: new Date()
  });
  await deliveryRecord.save();
  logger.info(`Saved DeliveryHistory record with ID: ${deliveryRecord._id}`);

  // Test GET request to the local backend proxy download route
  const downloadUrl = `http://localhost:5000/api/v1/delivery/download/${deliveryRecord._id}`;
  logger.info(`Testing GET ${downloadUrl}...`);

  try {
    const res = await axios({
      method: "get",
      url: downloadUrl,
      responseType: "arraybuffer"
    });

    logger.info("Headers received:");
    logger.info(`Content-Type: ${res.headers["content-type"]}`);
    logger.info(`Content-Disposition: ${res.headers["content-disposition"]}`);

    assert(res.status === 200, `Expected status 200, got ${res.status}`);
    assert(
      res.headers["content-type"] === "application/zip",
      `Expected Content-Type application/zip, got ${res.headers["content-type"]}`
    );
    assert(
      res.headers["content-disposition"].includes("attachment; filename="),
      "Expected Content-Disposition to include attachment and filename"
    );
    assert(
      res.headers["content-disposition"].includes(`.zip"`),
      "Expected Content-Disposition filename to end with .zip"
    );

    const downloadedText = Buffer.from(res.data).toString();
    assert(downloadedText === "verify_zip_download dummy contents", "Downloaded contents mismatch!");
    logger.info("File contents matched correctly.");
    logger.info("DOWNLOAD PROXY VERIFICATION PASSED SUCCESSFULLY!");
  } catch (err) {
    logger.error(`Download request failed: ${err.message}`);
    if (err.response) {
      logger.error(`Response status: ${err.response.status}`);
      logger.error(`Response data: ${Buffer.from(err.response.data).toString()}`);
    }
    throw err;
  } finally {
    logger.info("Cleaning up...");
    await DeliveryHistory.deleteOne({ _id: deliveryRecord._id });
    await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: "raw" });
    await mongoose.disconnect();
    logger.info("Cleanup completed.");
  }
}

runTests().catch((err) => {
  logger.error("Verification failed:", err);
  process.exit(1);
});
