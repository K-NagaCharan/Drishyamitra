import dotenv from "dotenv";
import { logger } from "./logger.js";

// Load environment variables from .env file
dotenv.config();

const requiredEnvVars = [
  "MONGO_URI",
  "JWT_SECRET",
  "GROQ_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET"
];

const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  logger.warn(
    `Missing environment variables: [${missingVars.join(", ")}]. Fallback values or mock behavior may be used during development.`
  );
}

export const env = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/apes",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  GMAIL_USER: process.env.GMAIL_USER || "",
  GMAIL_APP_PASS: process.env.GMAIL_APP_PASS || "",
  JWT_SECRET: process.env.JWT_SECRET || "dev_fallback_jwt_secret_key_12345",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  NODE_ENV: process.env.NODE_ENV || "development",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
  WHATSAPP_SESSION_PATH: process.env.WHATSAPP_SESSION_PATH || "./whatsapp-session",
  MAX_TOOL_DEPTH: parseInt(process.env.MAX_TOOL_DEPTH || "5", 10),
  MAX_HISTORY: parseInt(process.env.MAX_HISTORY || "20", 10),
  FACE_SERVICE_URL: process.env.FACE_SERVICE_URL || "http://localhost:5001",
  FACE_SUGGESTION_THRESHOLD: parseFloat(process.env.FACE_SUGGESTION_THRESHOLD || "0.75"),
  FACE_PROPAGATION_THRESHOLD: parseFloat(process.env.FACE_PROPAGATION_THRESHOLD || "0.85"),
  DELIVERY_SIZE_THRESHOLD_BYTES: parseInt(process.env.DELIVERY_SIZE_THRESHOLD_BYTES || "26214400", 10)
};
