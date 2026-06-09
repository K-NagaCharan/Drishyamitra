import app from "./app.js";
import redis from "./config/redis.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { initSocket } from "./socket/index.js";

const startServer = async () => {
  logger.info(`Starting APES Backend in ${env.NODE_ENV} mode...`);

  // Connect to database before listening
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server successfully listening on port ${env.PORT}`);
  });

  // Attach Socket.io server
  initSocket(server);

  // Safe process shutdown
  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    
    server.close(async () => {
      logger.info("HTTP server closed.");
      try {
        await redis.quit();
        logger.info("Redis client disconnected gracefully.");
      } catch (err) {
        logger.error({ err }, "Error quitting Redis client during shutdown");
      }
      process.exit(0);
    });

    // Force exit after 5 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit.");
      process.exit(1);
    }, 5000).unref();
  };

  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
};

startServer().catch((error) => {
  logger.fatal(`Critical error during server boot: ${error.message}`);
  process.exit(1);
});
