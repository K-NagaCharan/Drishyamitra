import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// Create Axios client instance sharing baseUrl and timeout configuration
export const client = axios.create({
  baseURL: env.FACE_SERVICE_URL,
  timeout: 90000 // 90 seconds recognition timeout
});

/**
 * Simple helper to wait for a given duration in milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * checkFaceServiceHealth
 * Probes the health of the Flask microservice.
 * GET ${env.FACE_SERVICE_URL}/health
 * Timeout: 5000 ms
 * 
 * Returns health status object. Never throws errors.
 */
export async function checkFaceServiceHealth() {
  try {
    const response = await client.get("/health", { timeout: 5000 });
    if (response.status === 200 && response.data) {
      return {
        healthy: true,
        service: "face-service",
        model: response.data.model,
        detector: response.data.detector
      };
    }
    return { healthy: false, service: "face-service" };
  } catch (error) {
    logger.error(
      { err: error.message },
      "Health check probe failed for face microservice"
    );
    return { healthy: false, service: "face-service" };
  }
}

/**
 * requestWithRetry
 * Generic helper executing requests with transient error retry policies.
 * 
 * Maximum of 3 attempts total (initial attempt + up to 2 retries).
 * Delays between retries: 500 ms (before attempt 2), 1000 ms (before attempt 3).
 * Retries are performed ONLY on:
 * - Request timeouts (Axios code ECONNABORTED)
 * - Connection refused / offline errors (Axios code ECONNREFUSED or no response received)
 * - HTTP Status 502, 503, and 504 responses.
 * 
 * Throws clean new Error("Face service unavailable") on final failure.
 * @param {object} config - Axios request configuration
 * @returns {Promise<any>} Response data from Python microservice
 */
async function requestWithRetry(config) {
  const retryDelays = [500, 1000, 2000];
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startTime = Date.now();
    try {
      logger.info(
        { requestType: "recognize", attempt },
        "Initiating request to face microservice"
      );

      const response = await client(config);
      const duration = Date.now() - startTime;
      const faceCount =
        response.data && response.data.faces ? response.data.faces.length : 0;

      logger.info(
        {
          requestType: "recognize",
          attempt,
          duration,
          faceCount
        },
        "Request to face microservice completed successfully"
      );

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = error.response ? error.response.status : null;
      
      const isTimeout =
        error.code === "ECONNABORTED" ||
        error.message.toLowerCase().includes("timeout");
      const isConnectionRefused =
        error.code === "ECONNREFUSED" ||
        !error.response;
      const isTransientHttp =
        status === 502 ||
        status === 503 ||
        status === 504;

      const shouldRetry = (isTimeout || isConnectionRefused || isTransientHttp) && attempt < maxAttempts;

      logger.warn(
        {
          requestType: "recognize",
          attempt,
          duration,
          status,
          errorCode: error.code,
          errorMessage: error.message,
          shouldRetry
        },
        `Attempt ${attempt} to face microservice failed`
      );

      if (shouldRetry) {
        const backoff = retryDelays[attempt - 1] || 1000;
        logger.info(
          { attempt, backoff },
          "Waiting before next attempt to face microservice"
        );
        await delay(backoff);
      } else {
        logger.error(
          {
            requestType: "recognize",
            status,
            errorCode: error.code,
            errorMessage: error.message
          },
          "Request to face microservice failed permanently"
        );
        throw new Error("Face service unavailable");
      }
    }
  }
}

/**
 * recognizeFaces
 * Sends POST /recognize request to Python service to detect faces and extract embeddings.
 * Uses transient error retries.
 * 
 * @param {string} imageUrl - Image public URL to process
 * @returns {Promise<any>} Unchanged response from python microservice
 */
export async function recognizeFaces(imageUrl) {
  return requestWithRetry({
    method: "post",
    url: "/recognize",
    data: { imageUrl }
  });
}
