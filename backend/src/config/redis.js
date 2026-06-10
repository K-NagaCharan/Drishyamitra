import IORedis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

// Create Redis client using environment variable REDIS_URL
const redis = new IORedis(env.REDIS_URL, {
  keepAlive: 10000,
  // Automatic reconnect strategy
  retryStrategy: (times) => {
    const delay = Math.min(times * 200, 2000);
    logger.warn(`Redis reconnect attempt #${times}, next try in ${delay}ms`);
    return delay;
  },
});

redis.on("connect", () => {
  logger.info("Redis client connected");
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis client error");
});

redis.on("ready", async () => {
  try {
    await redis.ping();
    logger.info("Redis ping successful – connection verified");
  } catch (e) {
    logger.error({ err: e }, "Redis ping failed");
  }
});

// Active keep-alive using application data to reset idle timeouts
setInterval(() => {
  if (redis.status === "ready") {
    redis.ping().catch((err) => {
      logger.error({ err: err.message }, "Redis keepalive ping failed");
    });
  }
}, 15000).unref();

export default redis;
