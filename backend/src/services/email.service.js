import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// Custom error class for email service failures
export class EmailServiceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "EmailServiceError";
    this.details = details;
  }
}

/**
 * Sends an email containing clickable Cloudinary photo links using Nodemailer.
 * 
 * @param {object} params
 * @param {string} params.recipient - The recipient's email address.
 * @param {string} params.subject - The email subject line.
 * @param {object[]} params.photos - Array of photo documents/objects (each must have url or imageUrl).
 * @returns {Promise<object>} Delivery metadata on success.
 */
export async function sendEmail({ recipient, subject, photos, zipUrl }) {
  // 1. Validations
  if (!recipient || typeof recipient !== "string" || recipient.trim() === "") {
    throw new EmailServiceError("Recipient email is required", { recipient });
  }
  if (!subject || typeof subject !== "string" || subject.trim() === "") {
    throw new EmailServiceError("Subject is required", { recipient });
  }
  if (!photos || !Array.isArray(photos)) {
    throw new EmailServiceError("Photos must be a valid array", { recipient });
  }

  // 2. Configuration verification
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASS) {
    const errorMsg = "SMTP configurations are missing (GMAIL_USER or GMAIL_APP_PASS not configured).";
    logger.error({ recipient, subject }, errorMsg);
    throw new EmailServiceError(errorMsg, { recipient, subject });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASS
      }
    });

    let htmlBody = "";
    if (zipUrl) {
      htmlBody = `
        <p>Here is the ZIP archive containing the shared photos you requested from your Drishyamitra gallery:</p>
        <p style="margin-top: 15px; margin-bottom: 15px;">
          <a href="${zipUrl}" style="display: inline-block; padding: 10px 20px; background-color: #c8501a; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Download ZIP Archive</a>
        </p>
      `;
    } else {
      const photoLinks = photos
        .map((p, idx) => {
          const url = p.url || p.imageUrl;
          if (!url) return null;
          return `<li>Photo ${idx + 1}: <a href="${url}">${url}</a></li>`;
        })
        .filter(Boolean)
        .join("\n");

      if (!photoLinks) {
        throw new EmailServiceError("No valid photo links found to include in the email", { recipient });
      }

      htmlBody = `
        <p>Here are the shared photos you requested from your Drishyamitra gallery:</p>
        <ul style="padding-left: 20px; line-height: 1.6;">
          ${photoLinks}
        </ul>
      `;
    }

    const mailOptions = {
      from: `"Drishyamitra Photo Ingestor" <${env.GMAIL_USER}>`,
      to: recipient,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #0f0e0c; background-color: #faf9f6; border: 1px solid #e8e4dc; border-radius: 8px; max-width: 600px;">
          <h2 style="font-family: serif; color: #c8501a; margin-top: 0;">${subject}</h2>
          ${htmlBody}
          <br/>
          <p style="font-size: 11px; color: #6b6760; border-top: 1px solid #e8e4dc; padding-top: 10px; margin-top: 20px;">
            This is an automated notification from Drishyamitra (Agentic Photos Evaluation & Segregation).
          </p>
        </div>
      `
    };

    logger.info({ recipient, photoCount: photos.length, isZip: !!zipUrl }, "Sending email via Nodemailer");
    const info = await transporter.sendMail(mailOptions);
    logger.info({ recipient, messageId: info.messageId }, "Email sent successfully");

    return {
      messageId: info.messageId,
      recipient,
      timestamp: new Date()
    };
  } catch (err) {
    logger.error({ err: err.message, recipient }, "Nodemailer sendMail failed");
    throw new EmailServiceError(`Failed to send email: ${err.message}`, {
      recipient,
      subject,
      originalError: err
    });
  }
}
