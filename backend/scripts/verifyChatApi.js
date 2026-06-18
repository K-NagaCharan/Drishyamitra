import app from "../src/app.js";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/config/logger.js";
import User from "../src/models/User.js";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";
import groq from "../src/config/groq.js";

const TEST_USER_EMAIL = "verify_chat_api_user@drishyamitra.com";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`[Assertion Failed] ${message}`);
    throw new Error(message);
  }
  logger.info(`[Assertion Passed] ${message}`);
};

const originalCreate = groq.chat.completions.create;

const setGroqMockTextResponse = (replyText) => {
  groq.chat.completions.create = async () => {
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: replyText,
            tool_calls: null
          }
        }
      ]
    };
  };
};

const restoreGroq = () => {
  groq.chat.completions.create = originalCreate;
};

const runVerification = async () => {
  logger.info("Starting Chat API integration verification tests...");

  // Setup Database
  await connectDB();

  // Clear previous test users
  await User.deleteMany({ email: TEST_USER_EMAIL });

  // Create test user
  const testUser = new User({
    username: "chatTester",
    email: TEST_USER_EMAIL,
    passwordHash: "dummyhash123"
  });
  await testUser.save();

  // Generate valid JWT token
  const token = jwt.sign(
    { sub: testUser._id.toString(), type: "access" },
    env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Start temporary server
  const testPort = 5002;
  const server = app.listen(testPort, () => {
    logger.info(`Verification server listening on port ${testPort}`);
  });

  const url = `http://localhost:${testPort}/api/chat`;

  try {
    // -------------------------------------------------------------
    // TEST 1: Valid Chat Request (Using standard successResponse)
    // -------------------------------------------------------------
    logger.info("--- Test 1: Valid Chat Request ---");
    setGroqMockTextResponse("Sure, here are your photos.");

    const res1 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ message: "Show my photos" })
    });

    const body1 = await res1.json();
    assert(res1.status === 200, "Valid request returns status 200");
    assert(body1.success === true, "ApiResponse success field is true");
    assert(body1.data.reply === "Sure, here are your photos.", "ApiResponse data contains exact reply message");

    // -------------------------------------------------------------
    // TEST 2: Missing JWT Token Auth Protection
    // -------------------------------------------------------------
    logger.info("--- Test 2: Missing JWT Token Access Check ---");
    const res2 = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" })
    });

    const body2 = await res2.json();
    assert(res2.status === 401, "Missing token yields status 401");
    assert(body2.success === false, "ApiResponse success is false");
    assert(body2.message.includes("No token provided"), "Authorization rejection message returned");

    // -------------------------------------------------------------
    // TEST 3: Missing Body / Empty Request
    // -------------------------------------------------------------
    logger.info("--- Test 3: Empty Body Rejection ---");
    const res3 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    const body3 = await res3.json();
    assert(res3.status === 400, "Empty request yields status 400");
    assert(body3.success === false, "ApiResponse success is false");
    assert(body3.message.includes("Message is required"), "Correct message required error payload");

    // -------------------------------------------------------------
    // TEST 4: Empty String Message Rejection
    // -------------------------------------------------------------
    logger.info("--- Test 4: Empty String Rejection ---");
    const res4 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ message: "" })
    });

    const body4 = await res4.json();
    assert(res4.status === 400, "Empty string yields status 400");
    assert(body4.success === false, "ApiResponse success is false");
    assert(body4.message.includes("cannot be empty"), "Correct message cannot be empty error payload");

    // -------------------------------------------------------------
    // TEST 5: Whitespace-Only Message Rejection
    // -------------------------------------------------------------
    logger.info("--- Test 5: Whitespace-Only Rejection ---");
    const res5 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ message: "      " })
    });

    const body5 = await res5.json();
    assert(res5.status === 400, "Whitespace message yields status 400");
    assert(body5.success === false, "ApiResponse success is false");
    assert(body5.message.includes("cannot be empty"), "Trims whitespace and throws empty error");

    // -------------------------------------------------------------
    // TEST 6: Non-String Argument Validation
    // -------------------------------------------------------------
    logger.info("--- Test 6: Non-String Argument Rejection ---");
    const res6 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ message: 12345 })
    });

    const body6 = await res6.json();
    assert(res6.status === 400, "Non-string yields status 400");
    assert(body6.success === false, "ApiResponse success is false");
    assert(body6.message.includes("must be a string"), "Returns type validation message");

    // -------------------------------------------------------------
    // TEST 7: Very Long Message Graceful Handling
    // -------------------------------------------------------------
    logger.info("--- Test 7: Very Long Message Graceful Handling ---");
    setGroqMockTextResponse("Received large prompt.");
    const longMessage = "a".repeat(10000);

    const res7 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ message: longMessage })
    });

    const body7 = await res7.json();
    assert(res7.status === 200, "Large prompt returns status 200 successfully");
    assert(body7.data.reply === "Received large prompt.", "Reply received matching large input mock completion");

    logger.info("ALL CHAT CONTROLLER & API INTEGRATION TESTS PASSED SUCCESSFULLY!");

  } finally {
    logger.info("Starting verification cleanup...");
    restoreGroq();
    await User.deleteMany({ email: TEST_USER_EMAIL });
    
    server.close(() => {
      logger.info("Verification server closed.");
    });

    await mongoose.connection.close();
    logger.info("Database connection closed.");
  }
};

runVerification().catch((err) => {
  logger.fatal(`Verification failed: ${err.message}`);
  mongoose.connection.close();
  process.exit(1);
});
