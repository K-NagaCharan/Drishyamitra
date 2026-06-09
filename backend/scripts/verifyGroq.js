import groq from "../src/config/groq.js";
import { MODELS } from "../src/config/models.js";
import { env } from "../src/config/env.js";
import { logger } from "../src/config/logger.js";

const verifyConnection = async () => {
  logger.info("Starting Groq connection verification...");

  // Validate API key first
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey || apiKey === "gsk_your_groq_api_key_here" || apiKey.trim() === "") {
    logger.error("GROQ_API_KEY is missing or configured with the default placeholder.");
    throw new Error("Invalid or unconfigured GROQ_API_KEY. Please provide a valid Groq API key in your .env file.");
  }

  logger.info(`Sending verification request using model: ${MODELS.FAST}...`);

  try {
    const response = await groq.chat.completions.create({
      model: MODELS.FAST,
      messages: [
        {
          role: "user",
          content: "Reply with the single word CONNECTED"
        }
      ],
      temperature: 0
    }, {
      signal: AbortSignal.timeout(10000) // 10 seconds timeout
    });

    if (!response?.choices?.[0]?.message?.content) {
      throw new Error("Invalid Groq response structure: choices[0].message.content was missing or empty.");
    }

    const responseText = response.choices[0].message.content.trim();
    logger.info(`Received response from Groq: "${responseText}"`);

    if (responseText.toUpperCase() === "CONNECTED") {
      logger.info("[Assertion Passed] Groq connection successful and output is correct!");
    } else {
      logger.warn(`[Warning] Connected but response was: "${responseText}" (Expected: "CONNECTED")`);
    }
  } catch (error) {
    if (error.name === "TimeoutError" || error.status === 408) {
      logger.error("Connection failed: Request timed out after 10 seconds.");
      throw error;
    }

    if (error.status) {
      switch (error.status) {
        case 401:
          logger.error("Connection failed: Authentication Error (401). Your GROQ_API_KEY is invalid.");
          break;
        case 429:
          logger.error("Connection failed: Rate Limit Exceeded (429). Please wait and try again later.");
          break;
        default:
          logger.error(`Connection failed: API Error Status ${error.status} - ${error.message}`);
      }
    } else {
      logger.error(`Connection failed: Network or unknown error - ${error.message}`);
    }
    throw error;
  }
};

verifyConnection()
  .then(() => {
    logger.info("Groq verification script execution completed successfully.");
    process.exit(0);
  })
  .catch((err) => {
    logger.fatal(`Verification failed: ${err.message}`);
    process.exit(1);
  });
