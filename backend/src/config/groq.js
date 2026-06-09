import Groq from "groq-sdk";
import { env } from "./env.js";
import { logger } from "./logger.js";

const groq = new Groq({
  apiKey: env.GROQ_API_KEY
});

logger.info("Groq client initialized.");

export default groq;
