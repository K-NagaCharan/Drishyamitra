import mongoose from "mongoose";
import * as photoService from "../services/photo.service.js";
import Photo from "../models/Photo.js";
import Face from "../models/Face.js";
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
    status: "completed"
  });

  await photo.save();

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

  // Find associated manual faces before deleting to update centroids
  const facesToDelete = await Face.find({ photoId: id }).select("personId labelSource").lean();
  const manualPersonIds = [...new Set(facesToDelete.filter(f => f.labelSource === "manual" && f.personId).map(f => f.personId.toString()))];

  // Remove metadata record
  await Photo.deleteOne({ _id: id });

  // Remove associated Face records
  await Face.deleteMany({ photoId: id });

  // Recalculate centroids for affected people
  for (const personId of manualPersonIds) {
    try {
      await updatePersonCentroid(personId);
    } catch (err) {
      logger.error({ personId, err: err.message }, "Failed to update centroid on photo delete");
    }
  }

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

  // Find associated manual faces before deleting to update centroids
  const facesToDelete = await Face.find({ photoId: { $in: ownedIds } }).select("personId labelSource").lean();
  const manualPersonIds = [...new Set(facesToDelete.filter(f => f.labelSource === "manual" && f.personId).map(f => f.personId.toString()))];

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

  // Recalculate centroids for affected people
  for (const personId of manualPersonIds) {
    try {
      await updatePersonCentroid(personId);
    } catch (err) {
      logger.error({ personId, err: err.message }, "Failed to update centroid during bulk delete");
    }
  }

  logger.info({ requestId: req.id, count: ownedIds.length }, "Photos successfully deleted in bulk from database");

  return res.status(200).json({
    success: true,
    message: `Successfully deleted ${ownedIds.length} photo(s)`
  });
});
