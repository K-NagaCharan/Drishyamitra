import cloudinary from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// Check if credentials are set
const isCloudinaryConfigured = 
  env.CLOUDINARY_CLOUD_NAME && 
  env.CLOUDINARY_CLOUD_NAME !== "your_cloudinary_cloud_name" &&
  env.CLOUDINARY_API_KEY && 
  env.CLOUDINARY_API_KEY !== "your_cloudinary_api_key";

/**
 * Upload an image buffer to Cloudinary using a write stream (or mock if unconfigured)
 * @param {Buffer} fileBuffer - Image file buffer
 * @returns {Promise<object>} - Cloudinary upload result
 */
export const uploadStream = (fileBuffer) => {
  // Test simulation for Cloudinary upload failure
  if (process.env.FORCE_CLOUDINARY_ERROR === "true") {
    logger.warn("Simulating Cloudinary upload failure...");
    return Promise.reject(new Error("Cloudinary upload failed (mocked error)"));
  }

  // Dynamic evaluation to capture runtime env modifications
  const allowMock = env.NODE_ENV === "test" || process.env.ALLOW_MOCK_CLOUDINARY === "true";
  const forceMock = process.env.FORCE_MOCK_CLOUDINARY === "true";

  if (!isCloudinaryConfigured || forceMock) {
    if (allowMock || forceMock) {
      logger.info("Cloudinary is not configured. Falling back to mock upload.");
      return Promise.resolve({
        secure_url: "https://res.cloudinary.com/dxgl7wq2e/image/upload/v1780994444/apes/photos/csferaoodlqmujzx6ti4.jpg",
        public_id: "apes/photos/mock_public_id_abc123",
        width: 1200,
        height: 800,
        bytes: 1048576 // 1 MB mock size
      });
    } else {
      logger.error("Cloudinary credentials missing in production! Aborting upload.");
      return Promise.reject(new Error("Cloudinary credentials are not configured."));
    }
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { 
        folder: "apes/photos",
        resource_type: "image"
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

/**
 * Delete a media asset from Cloudinary (or mock if unconfigured)
 * @param {string} publicId - Cloudinary asset public ID
 * @returns {Promise<object>} - Cloudinary destruction result
 */
export const deleteAsset = (publicId) => {
  const allowMock = env.NODE_ENV === "test" || process.env.ALLOW_MOCK_CLOUDINARY === "true";

  if (!isCloudinaryConfigured) {
    if (allowMock) {
      logger.info(`Cloudinary is not configured. Mocking deletion of publicId: ${publicId}`);
      return Promise.resolve({ result: "ok" });
    } else {
      logger.error("Cloudinary credentials missing in production! Aborting deletion.");
      return Promise.reject(new Error("Cloudinary credentials are not configured."));
    }
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};
