import DeliveryHistory from "../models/DeliveryHistory.js";
import { successResponse, errorResponse } from "../utils/apiResponse.js";
import { logger } from "../config/logger.js";
import mongoose from "mongoose";
import axios from "axios";
import { env } from "../config/env.js";


/**
 * Handles GET /api/v1/delivery/history
 * Retrieves paginated, filtered delivery history records for the authenticated user.
 */
export async function getDeliveryHistoryHandler(req, res) {
  const { page = "1", limit = "10", medium, format, status } = req.query;

  // Validate pagination parameters
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum <= 0) {
    return errorResponse(res, 400, "Invalid page parameter. Must be a positive integer.");
  }
  if (isNaN(limitNum) || limitNum <= 0) {
    return errorResponse(res, 400, "Invalid limit parameter. Must be a positive integer.");
  }

  // Validate filters
  if (medium && !["email", "whatsapp"].includes(medium)) {
    return errorResponse(res, 400, "Invalid medium filter. Must be 'email' or 'whatsapp'.");
  }
  if (format && !["links", "zip"].includes(format)) {
    return errorResponse(res, 400, "Invalid format filter. Must be 'links' or 'zip'.");
  }
  if (status && !["queued", "delivered", "failed"].includes(status)) {
    return errorResponse(res, 400, "Invalid status filter. Must be 'queued', 'delivered', or 'failed'.");
  }

  const userId = req.user._id;

  // Build query
  const query = { userId };
  if (medium) query.medium = medium;
  if (format) query.format = format;
  if (status) query.status = status;

  try {
    const skip = (pageNum - 1) * limitNum;
    const total = await DeliveryHistory.countDocuments(query);
    const records = await DeliveryHistory.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const results = records.map((r) => ({
      _id: r._id,
      recipient: r.recipient,
      medium: r.medium,
      format: r.format || "links",
      count: r.count || r.photoIds?.length || 0,
      status: r.status,
      createdAt: r.createdAt,
      deliveredAt: r.deliveredAt || null,
      zipDeletedAt: r.zipDeletedAt || null,
      zipUrl: r.zipUrl || null
    }));


    return successResponse(
      res,
      {
        records: results,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      },
      "Delivery history retrieved successfully."
    );
  } catch (error) {
    logger.error({ error: error.message, userId }, "Failed to retrieve delivery history");
    return errorResponse(res, 500, "Failed to retrieve delivery history.");
  }
}

/**
 * Handles GET /api/v1/delivery/download/:deliveryId
 * Streams the extensionless ZIP file from Cloudinary and returns it with a correct .zip extension.
 */
export async function downloadZipHandler(req, res) {
  const { deliveryId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
    return res.status(400).send("Invalid delivery ID format.");
  }

  try {
    const deliveryRecord = await DeliveryHistory.findById(deliveryId);
    if (!deliveryRecord) {
      return res.status(404).send("Delivery history record not found.");
    }

    if (deliveryRecord.format !== "zip" || !deliveryRecord.zipUrl) {
      return res.status(400).send("This delivery is not in ZIP format or the ZIP URL is missing.");
    }

    if (deliveryRecord.zipDeletedAt) {
      return res.status(410).send("This ZIP archive has expired and is no longer available.");
    }

    logger.info({ deliveryId, zipUrl: deliveryRecord.zipUrl }, "Proxying ZIP download from Cloudinary");

    // Fetch the raw stream from Cloudinary
    const response = await axios({
      method: "get",
      url: deliveryRecord.zipUrl,
      responseType: "stream"
    });

    // Set response headers to force download with proper filename
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="drishyamitra_photos_${deliveryId}.zip"`);

    // Stream error handling
    response.data.on("error", (err) => {
      logger.error({ err: err.message, deliveryId }, "Error streaming ZIP file from Cloudinary");
      if (!res.headersSent) {
        res.status(500).send("Error downloading file.");
      }
    });

    // Pipe the stream to the response
    response.data.pipe(res);
  } catch (error) {
    logger.error({ error: error.message, deliveryId }, "Failed to download ZIP file");
    return res.status(500).send("Failed to download ZIP file.");
  }
}

