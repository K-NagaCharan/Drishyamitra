import redis from "../config/redis.js";
import { logger } from "../config/logger.js";

const SESSION_TTL = 60 * 60 * 24; // 24 hours in seconds
const MAX_MESSAGES = 30; // Cap at 30 messages

/**
 * Returns the default session structure.
 * @returns {object}
 */
const getDefaultSession = () => ({
  messages: [],
  memory: {
    lastPhotoSearch: null,
    lastDelivery: null,
    pendingZipConfirmation: null
  }
});

/**
 * Validates the userId and returns the corresponding Redis key.
 * @param {string} userId
 * @returns {string}
 */
const getRedisKey = (userId) => {
  if (!userId) {
    throw new Error("userId is required");
  }
  return `session:${userId}`;
};

/**
 * Fetch session from Redis.
 * If missing, initializes and returns a default session.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const getSession = async (userId) => {
  const key = getRedisKey(userId);
  try {
    const data = await redis.get(key);
    if (!data) {
      return getDefaultSession();
    }
    return JSON.parse(data);
  } catch (error) {
    logger.error({ userId, error }, "Failed to get session from Redis");
    throw new Error(`Session retrieval failed: ${error.message}`);
  }
};

/**
 * Serializes and saves session to Redis, refreshing the 24-hour TTL.
 * @param {string} userId
 * @param {object} session
 * @returns {Promise<void>}
 */
export const saveSession = async (userId, session) => {
  const key = getRedisKey(userId);
  if (!session || typeof session !== "object") {
    throw new Error("Invalid session object provided");
  }
  try {
    const data = JSON.stringify(session);
    await redis.set(key, data, "EX", SESSION_TTL);
  } catch (error) {
    logger.error({ userId, error }, "Failed to save session to Redis");
    throw new Error(`Session save failed: ${error.message}`);
  }
};

/**
 * Deletes the Redis session completely.
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const clearSession = async (userId) => {
  const key = getRedisKey(userId);
  try {
    await redis.del(key);
  } catch (error) {
    logger.error({ userId, error }, "Failed to clear session in Redis");
    throw new Error(`Session deletion failed: ${error.message}`);
  }
};

/**
 * Appends a message to the session's messages array, caps history to 30, and saves.
 * @param {string} userId
 * @param {object} message
 * @returns {Promise<void>}
 */
export const appendMessage = async (userId, message) => {
  if (!message || typeof message !== "object") {
    throw new Error("Invalid message object provided");
  }
  try {
    const session = await getSession(userId);
    session.messages.push(message);

    // Limit the message history to the latest 30 messages
    if (session.messages.length > MAX_MESSAGES) {
      session.messages = session.messages.slice(-MAX_MESSAGES);
    }

    await saveSession(userId, session);
  } catch (error) {
    logger.error({ userId, error }, "Failed to append message to session");
    throw new Error(`Append message failed: ${error.message}`);
  }
};

/**
 * Merges new values into memory without overwriting unrelated fields.
 * @param {string} userId
 * @param {object} partialMemory
 * @returns {Promise<void>}
 */
export const updateMemory = async (userId, partialMemory) => {
  if (!partialMemory || typeof partialMemory !== "object") {
    throw new Error("Invalid partialMemory object provided");
  }
  try {
    const session = await getSession(userId);
    session.memory = {
      ...session.memory,
      ...partialMemory
    };
    await saveSession(userId, session);
  } catch (error) {
    logger.error({ userId, error }, "Failed to update session memory");
    throw new Error(`Memory update failed: ${error.message}`);
  }
};
