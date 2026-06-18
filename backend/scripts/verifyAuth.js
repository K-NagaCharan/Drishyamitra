import app from "../src/app.js";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/config/logger.js";
import User from "../src/models/User.js";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

const runVerification = async () => {
  logger.info("Starting Authentication layer verification tests...");

  // Setup DB
  await connectDB();

  // Clear any existing test user
  const testEmail = "verify_auth_test_user@drishyamitra.com";
  await User.deleteMany({ email: testEmail });

  // Start temporary testing server on an alternative port
  const testPort = 5001;
  const server = app.listen(testPort, () => {
    logger.info(`Verification server running on port ${testPort}`);
  });

  const baseUrl = `http://localhost:${testPort}/api/v1/auth`;

  try {
    let token = "";
    let userId = "";

    // -------------------------------------------------------------
    // TEST 1: Successful Registration & Password Leakage
    // -------------------------------------------------------------
    logger.info("--- Test 1: Register User and Password Leak Check ---");
    const regRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "authTester",
        email: testEmail,
        password: "securePassword123"
      })
    });

    const regData = await regRes.json();
    if (regRes.status !== 201 || !regData.success) {
      throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
    }

    token = regData.data.token;
    userId = regData.data.user.id;

    if (!token || !regData.data.expiresIn) {
      throw new Error("Registration response missing token or expiresIn metadata");
    }

    if (regData.data.user.password || regData.data.user.passwordHash) {
      throw new Error("SECURITY VIOLATION: password or passwordHash exposed in registration payload");
    }
    logger.info("PASSED: User registration succeeded. Token and expiresIn retrieved. passwordHash was not leaked.");

    // -------------------------------------------------------------
    // TEST 2: JWT Verification and Payload Structure
    // -------------------------------------------------------------
    logger.info("--- Test 2: JWT Structure and Signature Verification ---");
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded.sub !== userId || decoded.type !== "access") {
      throw new Error(`Invalid JWT payload contents: ${JSON.stringify(decoded)}`);
    }
    logger.info("PASSED: JWT signature is valid, and payload contains the expected sub and type claims.");

    // -------------------------------------------------------------
    // TEST 3: Duplicate Registration Rejection
    // -------------------------------------------------------------
    logger.info("--- Test 3: Duplicate Registration Rejection ---");
    const dupRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "authTester2",
        email: testEmail,
        password: "securePassword123"
      })
    });

    const dupData = await dupRes.json();
    if (dupRes.status !== 400 || dupData.success) {
      throw new Error("Accepted duplicate registration incorrectly");
    }
    logger.info("PASSED: Duplicate email registration blocked.");

    // -------------------------------------------------------------
    // TEST 4: Input Validation Errors (Pass < 8, invalid email)
    // -------------------------------------------------------------
    logger.info("--- Test 4: Register Validator bounds check ---");
    const valRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "at", // under 3 chars
        email: "invalidEmail",
        password: "123" // under 8 chars
      })
    });
    const valData = await valRes.json();
    if (valRes.status !== 400 || valData.success) {
      throw new Error("Accepted invalid inputs during registration");
    }
    logger.info("PASSED: Invalid inputs successfully rejected by validation middleware.");

    // -------------------------------------------------------------
    // TEST 5: Successful Login & Expiry Return
    // -------------------------------------------------------------
    logger.info("--- Test 5: User Login ---");
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "securePassword123"
      })
    });

    const loginData = await loginRes.json();
    if (loginRes.status !== 200 || !loginData.success) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }

    if (!loginData.data.token || !loginData.data.expiresIn) {
      throw new Error("Login response missing token or expiresIn metadata");
    }

    if (loginData.data.user.password || loginData.data.user.passwordHash) {
      throw new Error("SECURITY VIOLATION: password or passwordHash exposed in login response");
    }
    logger.info("PASSED: Login succeeded. Token and expiresIn returned. passwordHash not exposed.");

    // -------------------------------------------------------------
    // TEST 6: Wrong Password Login Rejection
    // -------------------------------------------------------------
    logger.info("--- Test 6: Wrong Credentials Login Rejection ---");
    const wrongRes = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "wrongPassword"
      })
    });
    const wrongData = await wrongRes.json();
    if (wrongRes.status !== 401 || wrongData.success) {
      throw new Error("Allowed login with incorrect password");
    }
    logger.info("PASSED: Rejected incorrect password login request with 401 status.");

    // -------------------------------------------------------------
    // TEST 7: Protected Route retrieve profile
    // -------------------------------------------------------------
    logger.info("--- Test 7: Access /me with Valid Token ---");
    const meRes = await fetch(`${baseUrl}/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData = await meRes.json();
    if (meRes.status !== 200 || !meData.success || meData.data.user.email !== testEmail) {
      throw new Error(`Protected route /me failed: ${JSON.stringify(meData)}`);
    }
    logger.info("PASSED: /me route successfully resolved profile details matching JWT subject claim.");

    // -------------------------------------------------------------
    // TEST 8: Missing Token Rejection
    // -------------------------------------------------------------
    logger.info("--- Test 8: Access /me with Missing Auth Header ---");
    const missingRes = await fetch(`${baseUrl}/me`, {
      method: "GET"
    });
    const missingData = await missingRes.json();
    if (missingRes.status !== 401 || missingData.success) {
      throw new Error("Access allowed to protected route without auth token");
    }
    logger.info("PASSED: Missing token request correctly rejected with 401 status.");

    // -------------------------------------------------------------
    // TEST 9: Expired Token Rejection
    // -------------------------------------------------------------
    logger.info("--- Test 9: Access /me with Expired Token ---");
    // Generate a token that is already expired
    const expiredToken = jwt.sign(
      { sub: userId, type: "access" },
      env.JWT_SECRET,
      { expiresIn: "1ms" }
    );
    // Introduce delay to guarantee expiration
    await new Promise((resolve) => setTimeout(resolve, 50));

    const expiredRes = await fetch(`${baseUrl}/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    const expiredData = await expiredRes.json();
    if (expiredRes.status !== 401 || expiredData.success || expiredData.message !== "Token has expired") {
      throw new Error(`Expired token check failed: ${JSON.stringify(expiredData)}`);
    }
    logger.info("PASSED: Expired token rejected with 401 status and 'Token has expired' message.");

    logger.info("ALL AUTHENTICATION INTEGRATION TESTS COMPLETED SUCCESSFULLY!");

  } finally {
    logger.info("Starting cleanup of verify test user...");
    await User.deleteMany({ email: testEmail });
    
    server.close(() => {
      logger.info("Verification server closed.");
    });

    await mongoose.connection.close();
    logger.info("Database connection closed.");
  }
};

runVerification().catch((err) => {
  logger.error(err, "CRITICAL: Auth verification run failed with error");
  mongoose.connection.close();
  process.exit(1);
});
