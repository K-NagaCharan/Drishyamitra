import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// Custom error class for WhatsApp service
export class WhatsAppServiceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "WhatsAppServiceError";
    this.details = details;
  }
}

// Private singleton client instance and ready state
let client = null;
let isReady = false;

/**
 * Initializes the WhatsApp client singleton.
 * Registers lifecycle hooks and starts initialization.
 *
 * @returns {object} The WhatsApp client singleton instance.
 */
export function initializeWhatsApp() {
  if (client) {
    logger.info("WhatsApp client already initialized or initializing.");
    return client;
  }

  logger.info({ sessionPath: env.WHATSAPP_SESSION_PATH }, "Initializing WhatsApp client with LocalAuth");

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: env.WHATSAPP_SESSION_PATH
    }),
    webVersionCache: {
      type: "none"
    },
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    }
  });

  client.on("qr", (qr) => {
    logger.info("WhatsApp QR code received. Scan it to authenticate:");
    qrcode.generate(qr, { small: true });
  });

  client.on("authenticated", () => {
    logger.info("WhatsApp client authenticated successfully.");
  });

  client.on("auth_failure", (msg) => {
    logger.error({ msg }, "WhatsApp authentication failure occurred");
  });

  client.on("ready", () => {
    logger.info("WhatsApp client is ready.");
    isReady = true;
  });

  client.on("disconnected", (reason) => {
    logger.warn({ reason }, "WhatsApp client disconnected");
    isReady = false;
  });

  client.on("change_state", (state) => {
    logger.info({ state }, "WhatsApp connection state changed");
  });

  // Start initialization process
  client.initialize().catch((err) => {
    logger.error({ err: err.message }, "Error during WhatsApp client initialization");
  });

  return client;
}

export async function getWhatsAppStatus() {
  let clientState = null;
  if (client) {
    try {
      clientState = await client.getState();
    } catch (err) {
      clientState = `Error: ${err.message}`;
    }
  }
  return {
    initialized: !!client,
    isReadyLocal: isReady,
    clientState
  };
}

/**
 * Helper to check if the WhatsApp client is ready and connected.
 * 
 * @returns {Promise<boolean>}
 */
export async function isWhatsAppReady() {
  if (!client) return false;
  try {
    const state = await client.getState();
    return state === "CONNECTED" || isReady;
  } catch (err) {
    // If getState fails (e.g. browser not open), return the local ready flag
    return isReady;
  }
}

/**
 * Sends a WhatsApp message containing photo links or custom text.
 *
 * @param {object} params
 * @param {string} params.recipient - The recipient's phone number.
 * @param {object[]} [params.photos] - Array of photo objects containing url/imageUrl.
 * @param {string} [params.text] - Custom text message body (takes priority if provided).
 * @returns {Promise<object>} Delivery metadata.
 */
export async function sendWhatsApp({ recipient, photos, text, zipUrl }) {
  if (!client) {
    throw new WhatsAppServiceError("WhatsApp client has not been initialized. Call initializeWhatsApp() first.");
  }

  // Ensure client is connected
  const ready = await isWhatsAppReady();
  if (!ready) {
    throw new WhatsAppServiceError("WhatsApp client is not ready. Authenticate or wait for connection.");
  }

  if (!recipient || typeof recipient !== "string" || recipient.trim() === "") {
    throw new WhatsAppServiceError("Recipient number is required");
  }

  // Build message content
  let message = "";
  if (text && typeof text === "string" && text.trim() !== "") {
    message = text;
  } else if (zipUrl) {
    message = `Here is the ZIP archive containing the shared photos you requested from your Drishyamitra gallery:\n\n${zipUrl}\n\nThis is an automated notification from Drishyamitra.`;
  } else {
    if (!photos || !Array.isArray(photos)) {
      throw new WhatsAppServiceError("Either text, zipUrl, or photos array must be provided");
    }

    const photoLinks = photos
      .map((p, idx) => {
        const url = p.url || p.imageUrl;
        if (!url) return null;
        return `${idx + 1}. ${url}`;
      })
      .filter(Boolean)
      .join("\n");

    if (!photoLinks) {
      throw new WhatsAppServiceError("No valid photo links found in photos array");
    }

    message = `Here are the shared photos you requested from your Drishyamitra gallery:\n\n${photoLinks}\n\nThis is an automated notification from Drishyamitra.`;
  }

  try {
    // Standardize recipient format for whatsapp-web.js
    let cleanRecipient = recipient.replace(/\D/g, "");
    if (cleanRecipient.startsWith("0")) {
      cleanRecipient = cleanRecipient.slice(1);
    }
    if (cleanRecipient.length === 10) {
      cleanRecipient = `91${cleanRecipient}`;
    }
    if (!cleanRecipient.endsWith("@c.us")) {
      cleanRecipient = `${cleanRecipient}@c.us`;
    }

    logger.info({ recipient: cleanRecipient }, "Sending WhatsApp message via whatsapp-web.js");
    const response = await client.sendMessage(cleanRecipient, message);
    logger.info({ recipient: cleanRecipient, messageId: response.id.id }, "WhatsApp message sent successfully");

    return {
      messageId: response.id.id,
      recipient,
      timestamp: new Date()
    };
  } catch (error) {
    logger.error({ err: error.message, recipient }, "Error sending WhatsApp message");
    throw new WhatsAppServiceError(`WhatsApp send message failed: ${error.message}`, {
      recipient,
      originalError: error
    });
  }
}

/**
 * Gracefully shuts down the WhatsApp client singleton.
 */
export async function shutdownWhatsApp() {
  if (!client) {
    return;
  }

  logger.info("Shutting down WhatsApp client...");
  try {
    await client.destroy();
    logger.info("WhatsApp client destroyed successfully.");
  } catch (err) {
    logger.error({ err: err.message }, "Error destroying WhatsApp client");
  } finally {
    client = null;
    isReady = false;
  }
}
