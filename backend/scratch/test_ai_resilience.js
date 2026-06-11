import groq from "../src/config/groq.js";
import { callGroqWithRetryAndTimeout } from "../src/agent/agentLoop.js";
import { circuitBreaker, metrics, CIRCUIT_STATES } from "../src/services/aiHealth.service.js";
import { handleChat } from "../src/controllers/chat.controller.js";
import { env } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import mongoose from "mongoose";

// Save original function for restoration
const originalCreate = groq.chat.completions.create;

const assert = (condition, message) => {
  if (!condition) {
    console.error(`❌ [Assertion Failed] ${message}`);
    process.exit(1);
  }
  console.log(`✅ [Assertion Passed] ${message}`);
};

// Mock request and response helpers
const mockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

const mockReq = (message) => {
  return {
    body: { message },
    user: { _id: "6a268c108425277e3ddee488" },
    id: "test-req-123"
  };
};

const runTests = async () => {
  console.log("=== Starting Groq Integration Resilience Unit Tests ===\n");

  // Set test mode to bypass DB queries inside agentLoop
  process.env.APES_TEST_MODE = "true";

  // Setup database connection so Mongoose queries don't buffer/timeout
  await connectDB();

  // Temporarily reduce circuit breaker limits for fast test runs
  const originalThreshold = env.GROQ_CIRCUIT_BREAKER_THRESHOLD;
  const originalResetMs = env.GROQ_CIRCUIT_BREAKER_RESET_MS;
  const originalMaxRetries = env.GROQ_MAX_RETRIES;
  const originalRetryDelay = env.GROQ_RETRY_DELAY_MS;

  env.GROQ_CIRCUIT_BREAKER_THRESHOLD = 3; // Trip after 3 consecutive failures instead of 5
  env.GROQ_CIRCUIT_BREAKER_RESET_MS = 1000; // Reset after 1 second instead of 30 seconds
  env.GROQ_MAX_RETRIES = 1; // 1 retry for faster test run
  env.GROQ_RETRY_DELAY_MS = 100; // 100ms base delay for tests

  // Reset circuit breaker state before testing
  circuitBreaker.recordSuccess();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Transient error (429 Rate Limit) retries and updates metrics
    // -------------------------------------------------------------------------
    console.log("--- Test 1: Transient Error (429 Rate Limit) Retry & Metrics ---");
    let callCount = 0;
    groq.chat.completions.create = async () => {
      callCount++;
      const rateLimitErr = new Error("Rate limit exceeded");
      rateLimitErr.status = 429;
      throw rateLimitErr;
    };

    try {
      await callGroqWithRetryAndTimeout({ messages: [] });
      assert(false, "Should have failed after retries");
    } catch (err) {
      assert(callCount === 2, `Should attempt 2 times (1 initial + 1 retry). Actual: ${callCount}`);
      assert(err.status === 429, "Error propagated should be 429");
      assert(metrics.rateLimitCount > 0, "Rate limit metric should be incremented");
      assert(circuitBreaker.failureCount === 1, `Circuit breaker should record 1 failure. Actual: ${circuitBreaker.failureCount}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Non-transient error (401 Auth) fails immediately without retry
    // -------------------------------------------------------------------------
    console.log("\n--- Test 2: Non-transient Error (401 Auth) Immediate Failure ---");
    callCount = 0;
    groq.chat.completions.create = async () => {
      callCount++;
      const authErr = new Error("Unauthorized");
      authErr.status = 401;
      throw authErr;
    };

    try {
      await callGroqWithRetryAndTimeout({ messages: [] });
      assert(false, "Should have failed immediately");
    } catch (err) {
      assert(callCount === 1, `Should attempt only 1 time. Actual: ${callCount}`);
      assert(err.status === 401, "Error should be 401");
      assert(metrics.authenticationFailures > 0, "Authentication failure metric should be incremented");
      assert(circuitBreaker.failureCount === 2, `Circuit breaker failure count should be 2. Actual: ${circuitBreaker.failureCount}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Circuit Breaker trips to OPEN on 3rd failure and fails fast
    // -------------------------------------------------------------------------
    console.log("\n--- Test 3: Circuit Breaker Trips and Fails Fast ---");
    callCount = 0;
    groq.chat.completions.create = async () => {
      callCount++;
      const err = new Error("Internal Server Error");
      err.status = 500;
      throw err;
    };

    try {
      await callGroqWithRetryAndTimeout({ messages: [] });
      assert(false, "Should have thrown error");
    } catch (err) {
      assert(circuitBreaker.state === CIRCUIT_STATES.OPEN, `Circuit breaker state should be OPEN. Actual: ${circuitBreaker.state}`);
      assert(circuitBreaker.failureCount === 3, "Failure count should reach 3");
    }

    // Now try another request immediately while circuit is OPEN
    callCount = 0;
    try {
      await callGroqWithRetryAndTimeout({ messages: [] });
      assert(false, "Should fail fast when circuit is open");
    } catch (err) {
      assert(callCount === 0, "Should NOT call Groq API when circuit is open");
      assert(err.name === "CircuitBreakerError", `Error name should be CircuitBreakerError. Actual: ${err.name}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Circuit transitions to HALF_OPEN and closes on success
    // -------------------------------------------------------------------------
    console.log("\n--- Test 4: Circuit Breaker Half-Open & Closure ---");
    console.log("Waiting 1.2 seconds for circuit reset delay...");
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Next request should attempt to call Groq (Half-Open trial)
    callCount = 0;
    groq.chat.completions.create = async () => {
      callCount++;
      return { choices: [{ message: { role: "assistant", content: "Success response!" } }] };
    };

    const resSuccess = await callGroqWithRetryAndTimeout({ messages: [] });
    assert(callCount === 1, "Should attempt 1 trial call in Half-Open state");
    assert(resSuccess.choices[0].message.content === "Success response!", "Success response payload returned");
    assert(circuitBreaker.state === CIRCUIT_STATES.CLOSED, `Circuit breaker should return to CLOSED. Actual: ${circuitBreaker.state}`);
    assert(circuitBreaker.failureCount === 0, "Failure count should reset to 0");

    // -------------------------------------------------------------------------
    // TEST 5: Controller maps different error types to friendly replies (200 OK)
    // -------------------------------------------------------------------------
    console.log("\n--- Test 5: Controller Error Mapping to Friendly Messages ---");

    // Scenario A: Timeout Error
    circuitBreaker.recordSuccess();
    groq.chat.completions.create = async () => {
      const err = new Error("API request timeout");
      err.name = "APIConnectionTimeoutError";
      throw err;
    };
    let req = mockReq("Hello assistant");
    let res = mockRes();
    await handleChat(req, res);
    assert(res.statusCode === 200, "Should return status 200 on timeout error");
    assert(res.body.success === true, "ApiResponse success should be true");
    assert(
      res.body.data.reply.includes("longer than expected") || res.body.data.reply.includes("taking longer"),
      `Timeout reply should be user-friendly. Actual: "${res.body.data.reply}"`
    );

    // Scenario B: Rate Limit Error
    circuitBreaker.recordSuccess();
    groq.chat.completions.create = async () => {
      const err = new Error("Rate limit exceeded");
      err.status = 429;
      throw err;
    };
    req = mockReq("Hello assistant");
    res = mockRes();
    await handleChat(req, res);
    assert(res.statusCode === 200, "Should return status 200 on rate limit error");
    assert(
      res.body.data.reply.includes("high demand") || res.body.data.reply.includes("busy"),
      `Rate limit reply should be user-friendly. Actual: "${res.body.data.reply}"`
    );

    // Scenario C: Connection Error (ENOTFOUND)
    circuitBreaker.recordSuccess();
    groq.chat.completions.create = async () => {
      const err = new Error("fetch failed: getaddrinfo ENOTFOUND api.groq.com");
      err.type = "APIConnectionError";
      throw err;
    };
    req = mockReq("Hello assistant");
    res = mockRes();
    await handleChat(req, res);
    assert(res.statusCode === 200, "Should return status 200 on connection error");
    assert(
      res.body.data.reply.includes("unable to connect"),
      `Connection reply should be user-friendly. Actual: "${res.body.data.reply}"`
    );

    // Scenario D: Circuit Breaker Open Error
    circuitBreaker.state = CIRCUIT_STATES.OPEN;
    circuitBreaker.nextAttemptTime = Date.now() + 5000; // block for 5s
    req = mockReq("Hello assistant");
    res = mockRes();
    await handleChat(req, res);
    assert(res.statusCode === 200, "Should return status 200 on open circuit breaker");
    assert(
      res.body.data.reply.includes("unreachable"),
      `Circuit breaker reply should be user-friendly. Actual: "${res.body.data.reply}"`
    );

    console.log("\n=== ALL integration resilience unit tests passed successfully! ===");

  } finally {
    // Restore settings & mocks
    groq.chat.completions.create = originalCreate;
    env.GROQ_CIRCUIT_BREAKER_THRESHOLD = originalThreshold;
    env.GROQ_CIRCUIT_BREAKER_RESET_MS = originalResetMs;
    env.GROQ_MAX_RETRIES = originalMaxRetries;
    env.GROQ_RETRY_DELAY_MS = originalRetryDelay;

    // Close database connection
    await mongoose.connection.close();
    console.log("Database connection closed.");
  }
};

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
