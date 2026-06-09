import {
  getSession,
  saveSession,
  clearSession,
  appendMessage,
  updateMemory
} from "../src/services/session.service.js";
import redis from "../src/config/redis.js";
import { logger } from "../src/config/logger.js";

const TEST_USER_ID = "663e2c9d17afbf937aef1234";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`[Assertion Failed] ${message}`);
    throw new Error(message);
  }
  logger.info(`[Assertion Passed] ${message}`);
};

const runVerification = async () => {
  logger.info("Starting session manager service verification...");

  // 1. Initial State: getSession should return default session
  logger.info("Step 1: Fetching initial session...");
  await clearSession(TEST_USER_ID); // Clean up from potential previous runs
  const initialSession = await getSession(TEST_USER_ID);
  assert(initialSession !== null, "Session should not be null");
  assert(Array.isArray(initialSession.messages), "messages should be an array");
  assert(initialSession.messages.length === 0, "messages should initially be empty");
  assert(initialSession.memory !== null, "memory should exist");
  assert(initialSession.memory.lastPhotoSearch === null, "lastPhotoSearch should be null");
  assert(initialSession.memory.lastDelivery === null, "lastDelivery should be null");
  assert(initialSession.memory.pendingZipConfirmation === null, "pendingZipConfirmation should be null");

  // 2. Input Validation: check if userId throws when empty
  logger.info("Step 2: Checking input validation...");
  try {
    await getSession(null);
    assert(false, "Should have thrown error when userId is missing");
  } catch (error) {
    assert(error.message.includes("userId is required"), "Correct error message for missing userId");
  }

  // 3. Append Message
  logger.info("Step 3: Appending a message...");
  const msg1 = { role: "user", content: "Show my photos" };
  await appendMessage(TEST_USER_ID, msg1);
  let updatedSession = await getSession(TEST_USER_ID);
  assert(updatedSession.messages.length === 1, "messages length should be 1");
  assert(updatedSession.messages[0].role === "user", "message role matches");
  assert(updatedSession.messages[0].content === "Show my photos", "message content matches");

  // 4. Update Memory
  logger.info("Step 4: Updating session memory (partial)...");
  await updateMemory(TEST_USER_ID, {
    lastPhotoSearch: { people: ["Dad"] }
  });
  updatedSession = await getSession(TEST_USER_ID);
  assert(updatedSession.messages.length === 1, "messages list remains intact");
  assert(
    JSON.stringify(updatedSession.memory.lastPhotoSearch) === JSON.stringify({ people: ["Dad"] }),
    "lastPhotoSearch updated correctly"
  );
  assert(updatedSession.memory.lastDelivery === null, "lastDelivery is still null");

  // 5. Test message capping (limit history to 30)
  logger.info("Step 5: Testing message history capping to 30 messages...");
  // We already appended 1 message. Let's append 35 more messages.
  for (let i = 1; i <= 35; i++) {
    await appendMessage(TEST_USER_ID, { role: "user", content: `Message #${i}` });
  }
  updatedSession = await getSession(TEST_USER_ID);
  assert(updatedSession.messages.length === 30, "messages array capped at 30 messages");
  assert(updatedSession.messages[0].content === "Message #6", "first message in history is index #6 (the oldest retained)");
  assert(updatedSession.messages[29].content === "Message #35", "last message is index #35");

  // 6. Test TTL Expiration
  logger.info("Step 6: Testing TTL expiration (24h)...");
  const ttl = await redis.ttl(`session:${TEST_USER_ID}`);
  logger.info(`Session key TTL is: ${ttl} seconds`);
  assert(ttl > 86300 && ttl <= 86400, "TTL should be set close to 24 hours (86400s)");

  // 7. Clear Session
  logger.info("Step 7: Clearing session...");
  await clearSession(TEST_USER_ID);
  const exists = await redis.exists(`session:${TEST_USER_ID}`);
  assert(exists === 0, "Redis key should no longer exist after clearSession");

  // 8. Verify getSession after clear returns fresh default session
  logger.info("Step 8: Fetching session again after clearing...");
  const clearedSession = await getSession(TEST_USER_ID);
  assert(clearedSession.messages.length === 0, "Session messages should be cleared and reset to empty");
  assert(clearedSession.memory.lastPhotoSearch === null, "Session memory should be reset to nulls");

  logger.info("All verification checks passed successfully!");
};

runVerification()
  .then(() => {
    logger.info("Verification execution completed successfully.");
    process.exit(0);
  })
  .catch((err) => {
    logger.fatal({ err }, "Verification failed with errors.");
    process.exit(1);
  });
