import mongoose from "mongoose";
import * as photoService from "../services/photo.service.js";
import Photo from "../models/Photo.js";
import Face from "../models/Face.js";
import Person from "../models/Person.js";
import DeliveryHistory from "../models/DeliveryHistory.js";
import redis from "../config/redis.js";
import { env } from "../config/env.js";
import { successResponse, errorResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../config/logger.js";
import { recognizeFaces } from "../services/faceRecognition.service.js";
import { processRecognizedFaces } from "../services/facePersistence.service.js";
import { updatePersonCentroid } from "../services/faceMatching.service.js";


/**
 * Handle photo upload requests
 */
export const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    return errorResponse(res, 400, "No file uploaded");
  }

  logger.info({ requestId: req.id, userId: req.user._id }, "Uploading buffer stream to Cloudinary");

  // Call Cloudinary stream upload
  const uploadResult = await photoService.uploadStream(req.file.buffer);

  // Persist image metadata
  const photo = new Photo({
    userId: req.user._id,
    url: uploadResult.secure_url,
    cloudinaryPublicId: uploadResult.public_id,
    width: uploadResult.width,
    height: uploadResult.height,
    bytes: uploadResult.bytes,
    status: "completed",
    originalName: req.file.originalname
  });

  await photo.save();

  // Clear stats cache
  redis.del(`stats:${req.user._id}`).catch(err => logger.error({ err: err.message }, "Failed to clear stats cache"));

  logger.info({ requestId: req.id, photoId: photo._id }, "Photo registered in MongoDB");

  // Trigger face recognition & persistence synchronously
  try {
    logger.info({ requestId: req.id, photoId: photo._id }, "Triggering face recognition for uploaded photo");
    const recognitionResult = await recognizeFaces(photo.url);
    if (recognitionResult && recognitionResult.faces) {
      const summary = await processRecognizedFaces(photo._id, recognitionResult.faces);
      photo.faceCount = summary.processed;
      await photo.save();
      logger.info(
        { requestId: req.id, photoId: photo._id, faceCount: photo.faceCount },
        "Face recognition completed and faceCount updated"
      );
    }
  } catch (error) {
    logger.error(
      { requestId: req.id, photoId: photo._id, err: error.message },
      "Face recognition processing failed during upload"
    );
  }

  return res.status(201).json({
    success: true,
    message: "Photo uploaded successfully",
    data: {
      photo: {
        id: photo._id,
        userId: photo.userId,
        url: photo.url,
        cloudinaryPublicId: photo.cloudinaryPublicId,
        width: photo.width,
        height: photo.height,
        status: photo.status,
        faceCount: photo.faceCount,
        uploadDate: photo.uploadDate
      }
    }
  });
});

/**
 * Handle listing photos for the authenticated user
 */
export const getPhotos = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || "30", 10);
  const skip = parseInt(req.query.skip || "0", 10);

  // Retrieve user's photos, sorted newest first
  const photos = await Photo.find({ userId: req.user._id })
    .sort({ uploadDate: -1 })
    .skip(skip)
    .limit(limit);

  const formattedPhotos = photos.map((photo) => ({
    id: photo._id,
    userId: photo.userId,
    url: photo.url,
    cloudinaryPublicId: photo.cloudinaryPublicId,
    width: photo.width,
    height: photo.height,
    status: photo.status,
    faceCount: photo.faceCount,
    uploadDate: photo.uploadDate
  }));

  return successResponse(res, { photos: formattedPhotos }, "Photos retrieved successfully");
});

/**
 * Handle photo deletions (including associated faces)
 */
export const deletePhoto = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const photo = await Photo.findById(id);
  if (!photo) {
    return errorResponse(res, 404, "Photo not found");
  }

  // Enforce ownership: 403 Forbidden on mismatch
  if (photo.userId.toString() !== req.user._id.toString()) {
    return errorResponse(res, 403, "Access denied. You do not own this photo.");
  }

  logger.info(
    { requestId: req.id, photoId: photo._id, publicId: photo.cloudinaryPublicId },
    "Destroying asset on Cloudinary"
  );

  // Remove from Cloudinary
  await photoService.deleteAsset(photo.cloudinaryPublicId);

  // Find associated faces before deleting to update centroids and clean up orphaned Person documents
  const facesToDelete = await Face.find({ photoId: id }).select("personId").lean();
  const affectedPersonIds = [...new Set(facesToDelete.filter(f => f.personId).map(f => f.personId.toString()))];

  // Remove metadata record
  await Photo.deleteOne({ _id: id });

  // Remove associated Face records
  await Face.deleteMany({ photoId: id });

  // Recalculate centroids for affected people, or delete the person if no faces remain
  for (const personId of affectedPersonIds) {
    try {
      const faceCount = await Face.countDocuments({ personId });
      if (faceCount === 0) {
        await Person.deleteOne({ _id: personId });
        logger.info({ personId }, "Person deleted because all their associated photos/faces were deleted");
      } else {
        await updatePersonCentroid(personId);
      }
    } catch (err) {
      logger.error({ personId, err: err.message }, "Failed to update centroid or delete person on photo delete");
    }
  }

  // Clear stats cache
  redis.del(`stats:${req.user._id}`).catch(err => logger.error({ err: err.message }, "Failed to clear stats cache"));

  logger.info({ requestId: req.id, photoId: photo._id }, "Photo successfully deleted from database");

  return successResponse(res, null, "Photo deleted successfully");
});

/**
 * Handle bulk photo deletions
 */
export const bulkDeletePhotos = asyncHandler(async (req, res) => {
  const { ids } = req.body; // Array of photo ObjectIDs

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return errorResponse(res, 400, "Invalid payload. Expected an array of photo IDs.");
  }

  // Validate all IDs
  for (const id of ids) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, `Invalid photo ID format: ${id}`);
    }
  }

  // Find all these photos and verify ownership
  const photos = await Photo.find({ _id: { $in: ids } });
  
  // Enforce ownership: filter photos that belong to the user
  const ownedPhotos = photos.filter(photo => photo.userId.toString() === req.user._id.toString());
  if (ownedPhotos.length === 0) {
    return errorResponse(res, 403, "Access denied. You do not own any of these photos.");
  }

  const ownedIds = ownedPhotos.map(p => p._id);
  const publicIds = ownedPhotos.map(p => p.cloudinaryPublicId);

  // Find associated faces before deleting to update centroids and clean up orphaned Person documents
  const facesToDelete = await Face.find({ photoId: { $in: ownedIds } }).select("personId").lean();
  const affectedPersonIds = [...new Set(facesToDelete.filter(f => f.personId).map(f => f.personId.toString()))];

  logger.info(
    { requestId: req.id, userId: req.user._id, count: ownedIds.length },
    "Bulk destroying assets on Cloudinary"
  );

  // Remove from Cloudinary in parallel/sequential loops
  for (const publicId of publicIds) {
    try {
      await photoService.deleteAsset(publicId);
    } catch (err) {
      logger.error({ publicId, err: err.message }, "Failed to delete Cloudinary asset during bulk delete");
    }
  }

  // Delete metadata records from database
  await Photo.deleteMany({ _id: { $in: ownedIds } });
  
  // Delete associated Face records to maintain integrity
  await Face.deleteMany({ photoId: { $in: ownedIds } });

  // Recalculate centroids for affected people, or delete the person if no faces remain
  for (const personId of affectedPersonIds) {
    try {
      const faceCount = await Face.countDocuments({ personId });
      if (faceCount === 0) {
        await Person.deleteOne({ _id: personId });
        logger.info({ personId }, "Person deleted during bulk delete because all their associated photos/faces were deleted");
      } else {
        await updatePersonCentroid(personId);
      }
    } catch (err) {
      logger.error({ personId, err: err.message }, "Failed to update centroid or delete person during bulk delete");
    }
  }

  // Clear stats cache
  redis.del(`stats:${req.user._id}`).catch(err => logger.error({ err: err.message }, "Failed to clear stats cache"));

  logger.info({ requestId: req.id, count: ownedIds.length }, "Photos successfully deleted in bulk from database");

  return res.status(200).json({
    success: true,
    message: `Successfully deleted ${ownedIds.length} photo(s)`
  });
});

/**
 * Retrieve details for a specific photo including all its associated faces
 */
export const getPhotoDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const photo = await Photo.findById(id);
  if (!photo) {
    return errorResponse(res, 404, "Photo not found");
  }

  // Enforce ownership
  if (photo.userId.toString() !== userId.toString()) {
    return errorResponse(res, 403, "Access denied. You do not own this photo.");
  }

  // Find all faces for this photo and populate person info
  const faces = await Face.find({ photoId: id, userId })
    .populate("personId", "name")
    .select("_id bbox personId")
    .lean();

  const formattedFaces = faces.map((face) => ({
    faceId: face._id,
    bbox: face.bbox,
    person: face.personId ? {
      id: face.personId._id,
      name: face.personId.name
    } : null
  }));

  const formattedPhoto = {
    id: photo._id,
    userId: photo.userId,
    url: photo.url,
    cloudinaryPublicId: photo.cloudinaryPublicId,
    width: photo.width,
    height: photo.height,
    status: photo.status,
    faceCount: photo.faceCount,
    uploadDate: photo.uploadDate,
    faces: formattedFaces
  };

  return successResponse(res, formattedPhoto, "Photo details retrieved successfully");
});

/**
 * Retrieve aggregated photo stats and recent activities for the authenticated user
 */
export const getPhotoStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const cacheKey = `stats:${userId}`;

  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return successResponse(res, JSON.parse(cachedData), "Statistics retrieved from cache");
    }
  } catch (err) {
    logger.error({ err: err.message }, "Redis error reading stats cache");
  }

  // Aggregate storage size
  const storageStatsPromise = Photo.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, totalBytes: { $sum: { $ifNull: ["$bytes", 0] } } } }
  ]);

  // Execute queries in parallel
  const [
    photosCount,
    peopleCount,
    facesCount,
    unlabeledFacesCount,
    storageStats,
    lastPhoto,
    recentPhotos,
    recentPeople,
    recentDeliveries
  ] = await Promise.all([
    Photo.countDocuments({ userId }),
    Person.countDocuments({ userId }),
    Face.countDocuments({ userId }),
    Face.countDocuments({ userId, isLabeled: false }),
    storageStatsPromise,
    Photo.findOne({ userId }).sort({ uploadDate: -1 }).lean(),
    Photo.find({ userId }).sort({ uploadDate: -1 }).limit(5).lean(),
    Person.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
    DeliveryHistory.find({ userId }).sort({ createdAt: -1 }).limit(5).lean()
  ]);

  const storageBytes = storageStats.length > 0 ? storageStats[0].totalBytes : 0;
  const storageLimitBytes = env.STORAGE_LIMIT_BYTES || 10737418240; // 10 GB fallback
  const storagePercent = parseFloat(((storageBytes / storageLimitBytes) * 100).toFixed(1));

  let lastUpload = null;
  if (lastPhoto) {
    lastUpload = {
      filename: lastPhoto.originalName || lastPhoto.url.split("/").pop() || "Photo",
      uploadedAt: lastPhoto.uploadDate
    };
  }

  // Construct dynamic activity feed
  const activities = [];

  // 1. Photo uploads & face detections & embeddings
  for (const p of recentPhotos) {
    const filename = p.originalName || p.url.split("/").pop() || "Photo";
    activities.push({
      type: "upload",
      message: `${filename} uploaded`,
      timestamp: p.uploadDate
    });
    if (p.faceCount > 0) {
      activities.push({
        type: "detection",
        message: `${p.faceCount} faces detected in ${filename}`,
        timestamp: p.uploadDate
      });
      activities.push({
        type: "embedding",
        message: `Embeddings generated for ${p.faceCount} faces`,
        timestamp: p.uploadDate
      });
    }
  }

  // 2. Labeled people
  for (const person of recentPeople) {
    activities.push({
      type: "label",
      message: `${person.name} labeled`,
      timestamp: person.createdAt
    });
  }

  // 3. Deliveries
  for (const d of recentDeliveries) {
    const statusText = d.status === "delivered" ? "completed" : d.status;
    const mediumName = d.medium === "whatsapp" ? "WhatsApp" : "Email";
    activities.push({
      type: "delivery",
      message: `${mediumName} delivery ${statusText}`,
      timestamp: d.createdAt
    });
  }

  // Sort chronologically (newest first) and limit to 5
  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const recentActivities = activities.slice(0, 5);

  const stats = {
    photosCount,
    peopleCount,
    facesCount,
    unlabeledFacesCount,
    embeddingsCount: facesCount, // Reuse facesCount
    storageBytes,
    storageLimitBytes,
    storagePercent,
    lastUpload,
    recentActivities
  };

  try {
    // Cache the response for 30 seconds
    await redis.set(cacheKey, JSON.stringify(stats), "EX", 30);
  } catch (err) {
    logger.error({ err: err.message }, "Redis error writing stats cache");
  }

  return successResponse(res, stats, "Statistics retrieved successfully");
});


