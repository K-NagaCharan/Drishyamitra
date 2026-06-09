import app from "./app.js";
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
  const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    server.close(() => {
      logger.info("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
};

startServer().catch((error) => {
  logger.fatal(`Critical error during server boot: ${error.message}`);
  process.exit(1);
});
