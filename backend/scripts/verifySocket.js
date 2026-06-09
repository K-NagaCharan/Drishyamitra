import { io } from "socket.io-client";
import { connectDB } from "../src/config/db.js";
import User from "../src/models/User.js";
import { generateToken } from "../src/utils/jwt.js";
import { env } from "../src/config/env.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// Setup environment and database
await connectDB();

const testConnect = (token) => {
  return new Promise((resolve) => {
    const socketUrl = env.PORT ? `http://localhost:${env.PORT}` : "http://localhost:5000";
    const socket = io(socketUrl, {
      auth: { token },
      autoConnect: true,
      reconnection: false
    });

    socket.on("connect", () => {
      resolve({ success: true, socket });
    });

    socket.on("connect_error", (error) => {
      resolve({ success: false, error: error.message, socket });
    });
  });
};

const runTests = async () => {
  let testUser = null;

  try {
    console.log("\n=================== STARTING SOCKET TESTS ===================");

    // Create a temporary test user
    const email = `socket_test_${Date.now()}@example.com`;
    testUser = new User({
      username: "socket_test_user",
      email,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuv"
    });
    await testUser.save();
    console.log(`Created temporary test user: ${testUser.username} (${email})`);

    // 1. Generate Valid Token
    const validToken = generateToken(testUser._id, testUser.username);

    // 2. Generate Invalid Token
    const invalidToken = "invalid_token_signature_string";

    // 3. Generate Expired Token
    const expiredToken = jwt.sign(
      {
        sub: testUser._id,
        username: testUser.username,
        type: "access"
      },
      env.JWT_SECRET,
      {
        expiresIn: "0s"
      }
    );

    // Test cases definition
    const testCases = [
      {
        name: "Valid Token Scenario",
        token: validToken,
        expectedSuccess: true
      },
      {
        name: "Invalid Token Scenario",
        token: invalidToken,
        expectedSuccess: false,
        expectedError: "Authentication error: Invalid token"
      },
      {
        name: "Missing Token Scenario",
        token: undefined,
        expectedSuccess: false,
        expectedError: "Authentication error: Missing token"
      },
      {
        name: "Expired Token Scenario",
        token: expiredToken,
        expectedSuccess: false,
        expectedError: "Authentication error: Token expired"
      }
    ];

    // Execute test cases
    for (const testCase of testCases) {
      console.log(`\nRunning Case: ${testCase.name}...`);
      const res = await testConnect(testCase.token);

      if (testCase.expectedSuccess) {
        if (res.success) {
          console.log(`✅ Success: Connected with valid JWT as expected.`);
          res.socket.disconnect();
        } else {
          console.log(`❌ Failure: Expected success, but failed to connect: ${res.error}`);
          throw new Error("Test failed: Valid token could not connect.");
        }
      } else {
        if (!res.success) {
          if (res.error === testCase.expectedError) {
            console.log(`✅ Success: Connection rejected as expected. Error matches: "${res.error}"`);
          } else {
            console.log(`❌ Failure: Connection rejected, but got unexpected error message: "${res.error}". Expected: "${testCase.expectedError}"`);
            throw new Error("Test failed: Unexpected error message.");
          }
          res.socket.disconnect();
        } else {
          console.log("❌ Failure: Connected successfully, but expected connection to be rejected.");
          res.socket.disconnect();
          throw new Error("Test failed: Unauthorized socket was allowed to connect.");
        }
      }
    }

    // 5. Reconnect Test
    console.log("\nRunning Case: Socket Reconnection Scenario...");
    const conn = await testConnect(validToken);
    if (!conn.success) {
      throw new Error("Reconnection test failed: Initial connection could not be established.");
    }
    const socket = conn.socket;
    console.log("✅ Initial connection established.");

    // Programmatically disconnect
    console.log("Disconnecting socket...");
    await new Promise((resolve) => {
      socket.on("disconnect", () => resolve());
      socket.disconnect();
    });
    console.log("✅ Socket disconnected.");

    // Programmatically reconnect
    console.log("Attempting manual reconnect...");
    await new Promise((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", (err) => reject(err));
      socket.connect();
    });
    console.log("✅ Reconnection succeeded!");
    socket.disconnect();

    console.log("\n=================== ALL SOCKET TESTS PASSED ===================");

  } catch (err) {
    console.error(`\n❌ Test suite failed with error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    // Clean up temporary user
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      console.log("Cleaned up temporary test user.");
    }
    await mongoose.connection.close();
    console.log("Closed database connection.");
  }
};

await runTests();
