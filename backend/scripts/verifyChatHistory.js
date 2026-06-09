import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/config/logger.js";
import User from "../src/models/User.js";
import ChatHistory from "../src/models/ChatHistory.js";
import { saveChatHistory } from "../src/services/chatHistory.service.js";

const TEST_USER_EMAIL = "verify_chat_history_user@apes.com";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`[Assertion Failed] ${message}`);
    throw new Error(message);
  }
  logger.info(`[Assertion Passed] ${message}`);
};

const runVerification = async () => {
  logger.info("Starting Chat History persistence verification tests...");

  // Setup DB
  await connectDB();

  // Clean previous test user data
  await User.deleteMany({ email: TEST_USER_EMAIL });
  
  // Create test user
  const testUser = new User({
    username: "historyTester",
    email: TEST_USER_EMAIL,
    passwordHash: "dummyhash123"
  });
  await testUser.save();
  const userId = testUser._id.toString();

  // Clean previous history for this user
  await ChatHistory.deleteMany({ userId: testUser._id });

  try {
    // -------------------------------------------------------------
    // TEST 1: Insert and Verify Single Completed Conversation
    // -------------------------------------------------------------
    logger.info("--- Test 1: Insert Single Chat Interaction ---");
    await saveChatHistory({
      userId,
      userMessage: "Show Dad's photos",
      assistantReply: "Here is Dad's photo."
    });

    // Query MongoDB
    const doc = await ChatHistory.findOne({ userId: testUser._id });
    assert(doc !== null, "ChatHistory document should exist in MongoDB");
    assert(doc.userId.toString() === userId, "userId matches test user");
    assert(doc.sessionId && typeof doc.sessionId === "string", "sessionId is a string");
    assert(doc.sessionId !== "default", "sessionId should be a generated UUID, not 'default'");
    assert(doc.userMessage === "Show Dad's photos", "userMessage matches input");
    assert(doc.assistantReply === "Here is Dad's photo.", "assistantReply matches input");
    assert(doc.createdAt instanceof Date, "createdAt is a Date instance");

    // -------------------------------------------------------------
    // TEST 2: Multiple Conversations and Chronological Sorting
    // -------------------------------------------------------------
    logger.info("--- Test 2: Multiple Conversations and Chronological Ordering ---");
    // Clear first test run
    await ChatHistory.deleteMany({ userId: testUser._id });

    // Insert conversation 1
    logger.info("Inserting conversation 1...");
    await saveChatHistory({
      userId,
      userMessage: "Message 1",
      assistantReply: "Reply 1"
    });

    // Wait 50ms to ensure distinct timestamp
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Insert conversation 2
    logger.info("Inserting conversation 2...");
    await saveChatHistory({
      userId,
      userMessage: "Message 2",
      assistantReply: "Reply 2"
    });

    // Wait 50ms to ensure distinct timestamp
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Insert conversation 3
    logger.info("Inserting conversation 3...");
    await saveChatHistory({
      userId,
      userMessage: "Message 3",
      assistantReply: "Reply 3"
    });

    // Retrieve documents sorted by createdAt descending
    const docs = await ChatHistory.find({ userId: testUser._id }).sort({ createdAt: -1 });

    assert(docs.length === 3, "Expected exactly 3 documents");
    assert(docs[0].userMessage === "Message 3", "First document (latest) is Message 3");
    assert(docs[1].userMessage === "Message 2", "Second document is Message 2");
    assert(docs[2].userMessage === "Message 1", "Third document (oldest) is Message 1");
    
    logger.info("PASSED: Chronological sorting (createdAt desc) assertion successful!");

    console.log("\nChat history verified successfully.");

  } finally {
    logger.info("Starting verification cleanup...");
    await ChatHistory.deleteMany({ userId: testUser._id });
    await User.deleteMany({ email: TEST_USER_EMAIL });
    await mongoose.connection.close();
    logger.info("Database connection closed.");
  }
};

runVerification().catch((err) => {
  logger.fatal(`Verification failed: ${err.message}`);
  mongoose.connection.close();
  process.exit(1);
});
