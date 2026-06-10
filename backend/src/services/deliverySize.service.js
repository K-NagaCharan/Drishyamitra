import Photo from "../models/Photo.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import mongoose from "mongoose";

// Custom error class for delivery size failures
export class DeliverySizeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DeliverySizeError";
    this.details = details;
  }
}

/**
 * Checks the total size of photos requested for delivery.
 * Determines if it exceeds the platforms threshold.
 * 
 * @param {object} params
 * @param {string[]|ObjectId[]} params.photoIds - Array of photo IDs to check.
 * @returns {Promise<object>} Size metadata and threshold flag.
 */
export async function checkDeliverySize({ photoIds }) {
  if (!photoIds || !Array.isArray(photoIds)) {
    throw new DeliverySizeError("photoIds must be a valid array");
  }

  const count = photoIds.length;
  if (count === 0) {
    return {
      totalBytes: 0,
      count: 0,
      exceedsThreshold: false
    };
  }

  // Validate ObjectId formats before querying
  const invalidIds = photoIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    throw new DeliverySizeError("Invalid photo ID format detected", { invalidIds });
  }

  // Fetch only the bytes field from the database
  let photos;
  try {
    photos = await Photo.find({ _id: { $in: photoIds } }).select("bytes").lean();
  } catch (err) {
    logger.error({ err: err.message }, "Error fetching photo bytes metadata from DB");
    throw new DeliverySizeError(`Failed to retrieve photos: ${err.message}`, { originalError: err });
  }

  // Check if all requested IDs were found in DB
  const foundIds = new Set(photos.map(p => p._id.toString()));
  const missingIds = photoIds.filter(id => !foundIds.has(id.toString()));
  if (missingIds.length > 0) {
    throw new DeliverySizeError("Some requested photos were not found", { missingIds });
  }

  // Check if any retrieved photos are missing the 'bytes' field
  const missingBytesIds = photos
    .filter(p => p.bytes === undefined || p.bytes === null || typeof p.bytes !== "number" || isNaN(p.bytes))
    .map(p => p._id.toString());
  if (missingBytesIds.length > 0) {
    throw new DeliverySizeError("Some photos are missing valid size metadata (bytes)", { missingBytesIds });
  }

  // Compute total bytes
  const totalBytes = photos.reduce((sum, p) => sum + p.bytes, 0);

  // Compare against threshold
  const threshold = env.DELIVERY_SIZE_THRESHOLD_BYTES;
  const exceedsThreshold = totalBytes > threshold;

  return {
    totalBytes,
    count,
    exceedsThreshold
  };
}
