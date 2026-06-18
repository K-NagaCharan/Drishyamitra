import { Worker } from "bullmq";
import { bullMQConnection } from "../config/bullmq.js";
import { logger } from "../config/logger.js";
import { emitDeliveryDone, emitDeliveryFailed, emitDeliveryStarted } from "../socket/events.js";
import DeliveryHistory from "../models/DeliveryHistory.js";
import { sendEmail } from "../services/email.service.js";
import { sendWhatsApp } from "../services/whatsapp.service.js";
import { env } from "../config/env.js";


const WORKER_NAME = process.env.DELIVERY_QUEUE_NAME || "deliveryQueue";

export const deliverPhotos = async (data) => {
  const { requestId } = data;
  if (!requestId) {
    throw new Error("requestId is required for delivery");
  }

  const deliveryRecord = await DeliveryHistory.findById(requestId).populate("photoIds");
  if (!deliveryRecord) throw new Error("Delivery record not found");

  const { recipient, medium, photoIds, format, zipUrl } = deliveryRecord;
  logger.info({ requestId, recipient, medium, count: photoIds.length, format }, "Processing delivery in worker");

  let result = null;
  if (medium === "email") {
    result = await deliveryHelpers.sendEmail({
      recipient,
      subject: format === "zip" ? "Your Shared Photos ZIP from Drishyamitra" : "Your Shared Photos from Drishyamitra",
      photos: photoIds,
      zipUrl: format === "zip" ? zipUrl : null
    });
  } else if (medium === "whatsapp") {
    result = await deliveryHelpers.sendWhatsApp({
      recipient,
      photos: photoIds,
      zipUrl: format === "zip" ? zipUrl : null
    });
  } else {


    throw new Error(`Unsupported medium: ${medium}`);
  }

  return {
    messageId: result.messageId,
    timestamp: result.timestamp,
    count: photoIds.length
  };
};

export const deliveryHelpers = {
  sendEmail,
  sendWhatsApp,
  mockDeliverPhotos: async (data) => {
    const { requestId } = data;
    if (!requestId) {
      // Fallback/stub for tests
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return true;
    }

    const deliveryRecord = await DeliveryHistory.findById(requestId).populate("photoIds");
    if (!deliveryRecord) throw new Error("Delivery record not found");

    const { recipient, medium, photoIds } = deliveryRecord;
    
    if (medium === "email") {
      if (!env.GMAIL_USER || !env.GMAIL_APP_PASS || env.GMAIL_APP_PASS === "ABC@123456" || env.GMAIL_APP_PASS.includes("your_")) {
        logger.info({ recipient, photoCount: photoIds.length }, "Simulating Email delivery in development mode (credentials not configured)");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return true;
      }

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: env.GMAIL_USER,
          pass: env.GMAIL_APP_PASS
        }
      });

      const photoLinks = photoIds
        .map((p, idx) => `<li>Photo ${idx + 1}: <a href="${p.url}">${p.url}</a></li>`)
        .join("\n");

      const mailOptions = {
        from: `"Drishyamitra Photo Ingestor" <${env.GMAIL_USER}>`,
        to: recipient,
        subject: "Your Shared Photos from Drishyamitra",
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #0f0e0c; background-color: #faf9f6; border: 1px solid #e8e4dc; border-radius: 8px; max-width: 600px;">
            <h2 style="font-family: serif; color: #c8501a; margin-top: 0;">Here are your shared photos!</h2>
            <p>You requested to share ${photoIds.length} photo(s) from your Drishyamitra gallery.</p>
            <ul style="padding-left: 20px;">
              ${photoLinks}
            </ul>
            <br/>
            <p style="font-size: 11px; color: #6b6760; border-top: 1px solid #e8e4dc; padding-top: 10px; margin-top: 20px;">
              This is an automated notification from Drishyamitra (Agentic Photos Evaluation & Segregation).
            </p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      logger.info({ recipient, photoCount: photoIds.length }, "Email delivered successfully via Nodemailer");
    } else {
      // Simulate WhatsApp delivery latency
      logger.info({ recipient, photoCount: photoIds.length }, "Simulating WhatsApp delivery in development mode");
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return true;
  }
};

let deliveryWorker = null;
let socketEmitter = null;

/**
 * Initializes the delivery worker with an optional socket emitter.
 * @param {object} emitter - Socket.io instance or custom emitter abstraction
 * @returns {object} - BullMQ Worker instance
 */
export const initDeliveryWorker = (emitter) => {
  if (deliveryWorker) {
    return deliveryWorker;
  }

  socketEmitter = emitter;

  deliveryWorker = new Worker(
    WORKER_NAME,
    async (job) => {
      const { requestId } = job.data;
      logger.info({ jobId: job.id, requestId }, "Delivery worker job started");

      // Emit delivery:started event
      try {
        if (socketEmitter && requestId) {
          const deliveryRecord = await DeliveryHistory.findById(requestId);
          if (deliveryRecord && deliveryRecord.userId) {
            emitDeliveryStarted(socketEmitter, deliveryRecord.userId, {
              jobId: job.id,
              deliveryId: requestId
            });
          }
        }
      } catch (emitError) {
        logger.warn(
          { jobId: job.id, err: emitError.message },
          "Failed to emit delivery:started event"
        );
      }

      try {
        // Execute delivery operation generically
        const deliveryResult = await deliverPhotos(job.data);

        logger.info(
          { jobId: job.id, requestId },
          "Delivery worker job completed successfully"
        );

        // Update database record status
        if (requestId && deliveryResult) {
          const deliveryRecord = await DeliveryHistory.findById(requestId);
          const format = deliveryRecord?.format || "links";
          const zipUrl = deliveryRecord?.zipUrl || null;
          const cloudinaryPublicId = deliveryRecord?.cloudinaryPublicId || null;

          await DeliveryHistory.updateOne(
            { _id: requestId },
            {
              $set: {
                status: "delivered",
                format,
                zipUrl,
                cloudinaryPublicId,
                count: deliveryResult.count,
                messageId: deliveryResult.messageId || null,
                deliveredAt: deliveryResult.timestamp || new Date()
              }
            }
          );
        }

        // Emit delivery:done event
        try {
          if (socketEmitter && requestId) {
            const deliveryRecord = await DeliveryHistory.findById(requestId);
            if (deliveryRecord && deliveryRecord.userId) {
              emitDeliveryDone(socketEmitter, deliveryRecord.userId, {
                jobId: job.id,
                success: true,
                deliveryId: requestId
              });
            }
          }
        } catch (emitError) {
          logger.warn(
            { jobId: job.id, err: emitError.message },
            "Failed to emit delivery:done event"
          );
        }

        return {
          success: true,
          processed: true,
          messageId: deliveryResult?.messageId
        };
      } catch (err) {
        logger.error(
          { jobId: job.id, attemptsMade: job.attemptsMade, err: err.message },
          "Delivery worker job processing error occurred"
        );
        
        // Update database record status to failed
        if (requestId) {
          await DeliveryHistory.updateOne(
            { _id: requestId },
            { $set: { status: "failed", error: err.message } }
          );
        }

        // Rethrow to let BullMQ retry policies handle recovery
        throw err;
      }
    },
    {
      connection: bullMQConnection,
      concurrency: parseInt(process.env.DELIVERY_WORKER_CONCURRENCY || "1", 10)
    }
  );

  // Worker lifecycle event telemetry
  deliveryWorker.on("failed", async (job, err) => {
    logger.error(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message },
      "Delivery worker job failed permanently"
    );

    // Emit delivery:failed only on the final failure attempt
    const maxAttempts = job?.opts?.attempts || 1;
    const attemptsMade = job?.attemptsMade || 0;
    if (attemptsMade >= maxAttempts) {
      try {
        // Update database record status to failed
        if (job.data?.requestId) {
          await DeliveryHistory.updateOne(
            { _id: job.data.requestId },
            { $set: { status: "failed", error: err.message } }
          );
        }

        if (socketEmitter && job.data?.requestId) {
          const deliveryRecord = await DeliveryHistory.findById(job.data.requestId);
          if (deliveryRecord && deliveryRecord.userId) {
            emitDeliveryFailed(socketEmitter, deliveryRecord.userId, {
              jobId: job.id,
              success: false,
              deliveryId: job.data.requestId,
              reason: err.message
            });
          }
        }
      } catch (emitError) {
        logger.warn(
          { jobId: job?.id, err: emitError.message },
          "Failed to emit delivery:failed event"
        );
      }
    }
  });

  deliveryWorker.on("error", (err) => {
    logger.error({ err: err.message }, "Delivery worker encountered connection or operational error");
  });

  return deliveryWorker;
};

/**
 * Returns the active delivery worker instance (or null if not initialized).
 * @returns {object|null}
 */
export const getDeliveryWorker = () => deliveryWorker;

/**
 * Gracefully shuts down the delivery worker.
 * @returns {Promise<void>}
 */
export async function closeDeliveryWorker() {
  if (!deliveryWorker || deliveryWorker.status === "closed") {
    return;
  }
  try {
    await deliveryWorker.close();
    logger.info("Delivery worker disconnected gracefully.");
  } catch (err) {
    logger.error({ err }, "Error shutting down delivery worker");
  }
}

