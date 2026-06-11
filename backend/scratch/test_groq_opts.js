import Groq from "groq-sdk";
import { env } from "../src/config/env.js";

try {
  const client = new Groq({
    apiKey: env.GROQ_API_KEY,
    timeout: 10000,
    maxRetries: 1
  });
  console.log("Successfully initialized Groq client with options.");
  process.exit(0);
} catch (err) {
  console.error("Failed to initialize Groq client:", err);
  process.exit(1);
}
