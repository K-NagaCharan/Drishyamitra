import { connectDB } from "./src/config/db.js";
import { logger } from "./src/config/logger.js";
import { initAllWorkers, closeAllWorkers } from "./src/workers/index.js";
import mongoose from "mongoose";

async function startWorkerProcess() {
  logger.info("Starting Drishyamitra worker process...");

  // 1. Establish MongoDB connection
  await connectDB();

  // 2. Initialize all background workers
  initAllWorkers(null);
  logger.info("Workers initialized successfully.");


  // Graceful shutdown strategy
  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    try {
      // Teardown BullMQ workers
      await closeAllWorkers();

      // Disconnect Mongoose
      await mongoose.disconnect();
      logger.info("MongoDB client disconnected gracefully.");
      
      logger.info("Worker process terminated gracefully.");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error quitting worker process during shutdown");
      process.exit(1);
    }
  };

  // Register signal listeners
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
}

startWorkerProcess().catch((error) => {
  logger.fatal(`Critical error during worker process boot: ${error.message}`);
  process.exit(1);
});
