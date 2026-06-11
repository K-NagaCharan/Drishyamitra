import { runAgent } from "../agent/agentLoop.js";
import { successResponse, errorResponse } from "../utils/apiResponse.js";
import { formatAgentResponse } from "../utils/chatFormatter.js";
import { logger } from "../config/logger.js";
import { clearChatHistory } from "../services/chatHistory.service.js";
import { clearSession } from "../services/session.service.js";

/**
 * Handle POST /api/chat protected endpoint
 */
export async function handleChat(req, res) {
  const rawMessage = req.body.message;

  // 1. Validation: Reject undefined, null, or non-string inputs
  if (rawMessage === undefined || rawMessage === null) {
    return errorResponse(res, 400, "Message is required.");
  }

  if (typeof rawMessage !== "string") {
    return errorResponse(res, 400, "Message must be a string.");
  }

  // Trim whitespace
  const message = rawMessage.trim();

  // Reject empty or whitespace-only messages
  if (message === "") {
    return errorResponse(res, 400, "Message cannot be empty.");
  }

  // 2. Extract authenticated user ID string from JWT user payload
  const userId = req.user._id.toString();

  // 3. Call runAgent
  try {
    const result = await runAgent({
      userId,
      message
    });

    // 4. Format response to presentation-ready data
    const formattedResponse = formatAgentResponse(result);

    // 5. Return reply and cards wrapped in standardized successResponse
    return successResponse(
      res,
      formattedResponse,
      "Chat response generated successfully."
    );
  } catch (error) {
    // Log full error internally for developer/diagnostic debugging
    logger.error(
      {
        err: {
          message: error.message,
          stack: error.stack,
          status: error.status || error.statusCode,
          type: error.type,
          name: error.name,
          groqCode: error.code,
          responseHeaders: error.headers
        },
        userId,
        message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      },
      "Chat controller failed to process request"
    );

    const friendlyReply = getFriendlyErrorMessage(error);

    // Return friendly assistant bubble status 200 to keep chat history intact
    return successResponse(
      res,
      {
        reply: friendlyReply,
        cards: []
      },
      "Chat request handled with a user-friendly error response."
    );
  }
}

/**
 * Handle DELETE /api/chat protected endpoint to clear chat history
 */
export async function clearChat(req, res) {
  const userId = req.user._id.toString();
  try {
    await clearChatHistory(userId);
    await clearSession(userId);
    return successResponse(res, null, "Chat history cleared successfully.");
  } catch (error) {
    logger.error(
      { err: error, userId },
      "Chat controller failed to clear history"
    );
    return errorResponse(res, 500, "Failed to clear chat history.");
  }
}

const FALLBACK_MESSAGES = [
  "I'm having trouble reaching the AI service right now.",
  "The AI service is temporarily busy. Please try again shortly.",
  "I'm experiencing a temporary connection issue. Your conversation is still safe.",
  "I couldn't reach the AI service this time. Please retry in a few moments."
];

function getRandomFallbackMessage() {
  const index = Math.floor(Math.random() * FALLBACK_MESSAGES.length);
  return FALLBACK_MESSAGES[index];
}

function getFriendlyErrorMessage(error) {
  const status = error.status || error.statusCode;
  const errMsg = error.message?.toLowerCase() || "";
  const errType = error.type?.toLowerCase() || "";
  const errName = error.name?.toLowerCase() || "";

  // Circuit Breaker Open
  if (errName === "CircuitBreakerError" || errMsg.includes("circuit breaker is open")) {
    return "The AI service is currently unreachable due to ongoing issues. Please try again in 30 seconds.";
  }

  // Timeout
  if (
    errName === "GatewayTimeoutError" ||
    errName === "APIConnectionTimeoutError" ||
    errType.includes("timeout") ||
    errMsg.includes("timeout") ||
    errMsg.includes("timed out")
  ) {
    return "I'm taking longer than expected to respond. Please try again in a few moments.";
  }

  // Rate Limit (429)
  if (
    status === 429 ||
    errType.includes("ratelimit") ||
    errMsg.includes("429") ||
    errMsg.includes("rate limit")
  ) {
    return "The AI service is experiencing high demand right now. Please wait a moment and try again.";
  }

  // Authentication / Authorization (401/403)
  if (
    status === 401 ||
    status === 403 ||
    errMsg.includes("unauthorized") ||
    errMsg.includes("401") ||
    errMsg.includes("403") ||
    errMsg.includes("auth")
  ) {
    return "The AI service is temporarily unavailable due to a configuration issue.";
  }

  // Network / Connection Error
  if (
    errType.includes("apiconnection") ||
    errMsg.includes("getaddrinfo") ||
    errMsg.includes("econnreset") ||
    errMsg.includes("enotfound") ||
    errMsg.includes("etimedout") ||
    errMsg.includes("fetch failed")
  ) {
    return "I'm currently unable to connect to the AI service. Please try again shortly.";
  }

  // Server Error (5xx)
  if (status >= 500 && status <= 599) {
    return "The AI service is temporarily unavailable. Please try again later.";
  }

  // Unknown Error
  return getRandomFallbackMessage();
}
