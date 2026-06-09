import { v4 as uuidv4 } from "uuid";
import ChatHistory from "../models/ChatHistory.js";
import { logger } from "../config/logger.js";

/**
 * Persist a completed user/assistant conversation turn into MongoDB.
 *
 * @param {object} params
 * @param {string} params.userId - The ID of the user.
 * @param {string} params.userMessage - The user's input prompt.
 * @param {string} params.assistantReply - The final response returned by the assistant.
 * @returns {Promise<void>}
 */
export async function saveChatHistory({ userId, userMessage, assistantReply }) {
  if (!userId) {
    throw new Error("userId is required for chat history");
  }
  if (!userMessage) {
    throw new Error("userMessage is required for chat history");
  }
  if (!assistantReply) {
    throw new Error("assistantReply is required for chat history");
  }

  logger.info({ userId }, "Saving completed chat interaction to database");

  const history = new ChatHistory({
    userId,
    sessionId: uuidv4(),
    userMessage,
    assistantReply
  });

  await history.save();
}
