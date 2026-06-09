import mongoose from "mongoose";
import Face from "../models/Face.js";
import * as faceLabelingService from "../services/faceLabeling.service.js";
import * as faceSuggestionService from "../services/faceSuggestion.service.js";
import { successResponse, errorResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../config/logger.js";
import { ValidationError, AuthorizationError, NotFoundError } from "../utils/errors.js";

/**
 * Retrieve sorted and paginated unlabeled faces for the authenticated user
 */
export const getUnlabeledFaces = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const userId = req.user._id;

  // Pagination parameters
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "20", 10)));
  const skip = (page - 1) * limit;

  // Retrieve unlabeled faces sorted oldest first
  const faces = await Face.find({ userId, isLabeled: false })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .populate("photoId", "url")
    .select("_id photoId bbox")
    .lean();

  const formattedFaces = faces.map((face) => ({
    faceId: face._id,
    photoId: face.photoId ? face.photoId._id : null,
    photoUrl: face.photoId ? face.photoId.url : null,
    bbox: face.bbox
  }));

  const duration = Date.now() - startTime;

  logger.info(
    {
      endpoint: "GET /faces/unlabeled",
      userId,
      count: formattedFaces.length,
      page,
      limit,
      duration
    },
    "Unlabeled faces retrieved successfully"
  );

  // Return success response with mapped array (empty array is returned as 200, not 404)
  return res.status(200).json(formattedFaces);
});

/**
 * Assign a person name to an unlabeled face (initiating automatic propagation)
 */
export const labelFace = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { faceId } = req.params;
  const { personName } = req.body;
  const userId = req.user._id;

  // 1. Controller-level validation of faceId format
  if (!mongoose.Types.ObjectId.isValid(faceId)) {
    logger.warn(
      {
        endpoint: "POST /faces/:faceId/label",
        userId,
        faceId,
        duration: Date.now() - startTime
      },
      "Label face attempt failed: invalid faceId format"
    );
    return errorResponse(res, 400, "Invalid faceId format");
  }

  // 2. Controller-level validation of personName input
  if (typeof personName !== "string" || personName.trim().length === 0) {
    logger.warn(
      {
        endpoint: "POST /faces/:faceId/label",
        userId,
        faceId,
        duration: Date.now() - startTime
      },
      "Label face attempt failed: invalid or empty personName input"
    );
    return errorResponse(res, 400, "Person name is required and must be a non-empty string");
  }

  try {
    const result = await faceLabelingService.labelFace(faceId, userId, personName);

    const duration = Date.now() - startTime;

    logger.info(
      {
        endpoint: "POST /faces/:faceId/label",
        userId,
        faceId,
        duration
      },
      "Face successfully labeled and propagated"
    );

    return res.status(200).json(result);
  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      {
        endpoint: "POST /faces/:faceId/label",
        userId,
        faceId,
        duration,
        error: err.message
      },
      "Error occurred during face labeling controller execution"
    );

    // Map custom exception objects to their respective HTTP status codes
    if (err instanceof ValidationError) {
      return errorResponse(res, 400, err.message);
    }
    if (err instanceof AuthorizationError) {
      return errorResponse(res, 403, err.message);
    }
    if (err instanceof NotFoundError) {
      return errorResponse(res, 404, err.message);
    }

    // Default status for unexpected server errors
    return errorResponse(res, 500, "Unexpected server error");
  }
});

/**
 * Retrieve visual name suggestion for an unlabeled face based on previous matches
 */
export const getFaceSuggestion = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { faceId } = req.params;
  const userId = req.user._id;

  // 1. Validate faceId format
  if (!mongoose.Types.ObjectId.isValid(faceId)) {
    logger.warn({ endpoint: "GET /faces/:faceId/suggest", userId, faceId }, "Suggestion query failed: invalid faceId");
    return errorResponse(res, 400, "Invalid faceId format");
  }

  // 2. Retrieve face document
  const face = await Face.findById(faceId);
  if (!face) {
    logger.warn({ endpoint: "GET /faces/:faceId/suggest", userId, faceId }, "Suggestion query failed: face not found");
    return errorResponse(res, 404, "Face not found");
  }

  // 3. Verify user tenancy ownership
  if (face.userId.toString() !== userId.toString()) {
    logger.warn({ endpoint: "GET /faces/:faceId/suggest", userId, faceId }, "Suggestion query failed: access denied");
    return errorResponse(res, 403, "Access denied. You do not own this face.");
  }

  // 4. Resolve suggestion
  const result = await faceSuggestionService.suggestFaceLabel(face.embedding, userId);

  const duration = Date.now() - startTime;
  logger.info({
    endpoint: "GET /faces/:faceId/suggest",
    userId,
    faceId,
    suggested: result.suggested,
    duration
  }, "Face suggestion resolved successfully");

  return res.status(200).json(result);
});
