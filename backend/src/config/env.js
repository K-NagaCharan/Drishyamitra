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
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/drishyamitra",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_FAST_MODEL: process.env.GROQ_FAST_MODEL || "llama-3.1-8b-instant",
  GROQ_REASONING_MODEL: process.env.GROQ_REASONING_MODEL || "llama-3.3-70b-versatile",
  GROQ_TIMEOUT_MS: parseInt(process.env.GROQ_TIMEOUT_MS || "20000", 10),
  GROQ_MAX_RETRIES: parseInt(process.env.GROQ_MAX_RETRIES || "2", 10),
  GROQ_RETRY_DELAY_MS: parseInt(process.env.GROQ_RETRY_DELAY_MS || "500", 10),
  GROQ_CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.GROQ_CIRCUIT_BREAKER_THRESHOLD || "5", 10),
  GROQ_CIRCUIT_BREAKER_RESET_MS: parseInt(process.env.GROQ_CIRCUIT_BREAKER_RESET_MS || "30000", 10),
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  GMAIL_USER: process.env.GMAIL_USER || "",
  GMAIL_APP_PASS: process.env.GMAIL_APP_PASS || "",
  JWT_SECRET: process.env.JWT_SECRET || "dev_fallback_jwt_secret_key_12345",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  NODE_ENV: process.env.NODE_ENV || "development",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
  BACKEND_URL: process.env.BACKEND_URL || "http://localhost:5000",

  WHATSAPP_SESSION_PATH: process.env.WHATSAPP_SESSION_PATH || "./whatsapp-session",
  MAX_TOOL_DEPTH: parseInt(process.env.MAX_TOOL_DEPTH || "5", 10),
  MAX_HISTORY: parseInt(process.env.MAX_HISTORY || "20", 10),
  FACE_SERVICE_URL: process.env.FACE_SERVICE_URL || "http://localhost:5001",
  FACE_SUGGESTION_THRESHOLD: parseFloat(process.env.FACE_SUGGESTION_THRESHOLD || "0.50"),
  FACE_PROPAGATION_THRESHOLD: parseFloat(process.env.FACE_PROPAGATION_THRESHOLD || "0.60"),
  FACE_MATCH_MARGIN: parseFloat(process.env.FACE_MATCH_MARGIN || "0.05"),
  DELIVERY_SIZE_THRESHOLD_BYTES: parseInt(process.env.DELIVERY_SIZE_THRESHOLD_BYTES || "26214400", 10),
  ZIP_CONFIRMATION_TTL_SECONDS: parseInt(process.env.ZIP_CONFIRMATION_TTL_SECONDS || "600", 10),
  ZIP_CLEANUP_INTERVAL_HOURS: parseFloat(process.env.ZIP_CLEANUP_INTERVAL_HOURS || "24"),
  ZIP_RETENTION_HOURS: parseFloat(process.env.ZIP_RETENTION_HOURS || "24"),
  STORAGE_LIMIT_BYTES: parseInt(process.env.STORAGE_LIMIT_BYTES || "10737418240", 10) // default 10 GB
};
