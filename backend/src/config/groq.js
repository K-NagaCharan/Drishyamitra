import Groq from "groq-sdk";
import { env } from "./env.js";
import { logger } from "./logger.js";

const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
  timeout: env.GROQ_TIMEOUT_MS,
  maxRetries: 0 // Disable SDK built-in retries to use our custom retry + backoff implementation
});

logger.info("Groq client initialized.");

export default groq;
