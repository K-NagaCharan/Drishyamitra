import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// Circuit Breaker States
export const CIRCUIT_STATES = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN"
};

// Metrics tracking structure
export const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  timeoutCount: 0,
  rateLimitCount: 0,
  authenticationFailures: 0,
  networkFailures: 0,
  averageResponseTimeMs: 0,
  totalResponseTimeMs: 0
};

// Circuit Breaker state management object
export const circuitBreaker = {
  state: CIRCUIT_STATES.CLOSED,
  failureCount: 0,
  lastFailureTime: null,
  nextAttemptTime: null,

  recordSuccess() {
    if (this.state !== CIRCUIT_STATES.CLOSED) {
      logger.info(`Circuit breaker transitioned from ${this.state} to CLOSED after a successful call.`);
    }
    this.failureCount = 0;
    this.state = CIRCUIT_STATES.CLOSED;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  },

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    const threshold = env.GROQ_CIRCUIT_BREAKER_THRESHOLD || 5;
    const resetMs = env.GROQ_CIRCUIT_BREAKER_RESET_MS || 30000;

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      // Half-open failure goes straight back to open with reset delay
      this.state = CIRCUIT_STATES.OPEN;
      this.nextAttemptTime = Date.now() + resetMs;
      logger.warn(
        `Circuit breaker Half-Open failure. Tripping back to OPEN. Next attempt allowed at ${new Date(this.nextAttemptTime).toISOString()}`
      );
    } else if (this.failureCount >= threshold && this.state !== CIRCUIT_STATES.OPEN) {
      this.state = CIRCUIT_STATES.OPEN;
      this.nextAttemptTime = Date.now() + resetMs;
      logger.error(
        `Circuit breaker tripped to OPEN due to ${this.failureCount} consecutive failures. Next attempt allowed at ${new Date(this.nextAttemptTime).toISOString()}`
      );
    } else {
      logger.warn(`Consecutive Groq failures registered: ${this.failureCount}/${threshold}`);
    }
  },

  checkCallAllowed() {
    if (this.state === CIRCUIT_STATES.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = CIRCUIT_STATES.HALF_OPEN;
        logger.info("Circuit breaker transitioning to HALF_OPEN to trial a test request.");
        return true;
      }
      return false; // Circuit is open, block execution
    }
    return true; // CLOSED or HALF_OPEN
  }
};

/**
 * Record a successful response and update time metrics.
 * @param {number} durationMs - Response duration in milliseconds.
 */
export function updateResponseTime(durationMs) {
  metrics.totalRequests++;
  metrics.successfulRequests++;
  metrics.totalResponseTimeMs += durationMs;
  metrics.averageResponseTimeMs = Math.round(metrics.totalResponseTimeMs / metrics.successfulRequests);
}

/**
 * Classify failure and update corresponding metric counts.
 * @param {Error} error - Thrown error object.
 */
export function recordFailureMetric(error) {
  metrics.totalRequests++;

  const status = error.status || error.statusCode;
  const errMsg = error.message?.toLowerCase() || "";
  const errType = error.type?.toLowerCase() || "";
  const errName = error.name?.toLowerCase() || "";

  if (
    status === 429 ||
    errType.includes("ratelimit") ||
    errMsg.includes("429") ||
    errMsg.includes("rate limit")
  ) {
    metrics.rateLimitCount++;
  } else if (
    status === 401 ||
    status === 403 ||
    errMsg.includes("unauthorized") ||
    errMsg.includes("401") ||
    errMsg.includes("403") ||
    errMsg.includes("auth")
  ) {
    metrics.authenticationFailures++;
  } else if (
    errName === "GatewayTimeoutError" ||
    errName === "APIConnectionTimeoutError" ||
    errType.includes("timeout") ||
    errMsg.includes("timeout") ||
    errMsg.includes("timed out")
  ) {
    metrics.timeoutCount++;
  } else if (
    errType.includes("apiconnection") ||
    errMsg.includes("getaddrinfo") ||
    errMsg.includes("econnreset") ||
    errMsg.includes("enotfound") ||
    errMsg.includes("etimedout") ||
    errMsg.includes("fetch failed")
  ) {
    metrics.networkFailures++;
  }
}
