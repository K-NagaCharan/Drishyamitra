import express from "express";
import cors from "cors";
import { logger } from "./config/logger.js";
import { requestId } from "./middlewares/requestId.js";
import path from "path";
import { errorHandler } from "./middlewares/errorHandler.js";

// Routes imports
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import photoRoutes from "./routes/photo.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import faceRoutes from "./routes/face.routes.js";
import deliveryRoutes from "./routes/delivery.routes.js";

const app = express();

// Apply global middlewares
app.use(cors());
app.use(express.json());
app.use(requestId);
// Serve uploaded photos statically
app.use("/uploads", express.static(path.resolve("uploads")));


// Log details of all incoming requests via pino
app.use((req, res, next) => {
  logger.info({
    requestId: req.id,
    method: req.method,
    url: req.originalUrl || req.url
  }, "Incoming API request");
  next();
});

// Map routes under versioned prefix
app.use("/api/v1/health", healthRoutes);
app.use("/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/photos", photoRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/faces", faceRoutes);
app.use("/api/v1/faces", faceRoutes);
app.use("/api/v1/delivery", deliveryRoutes);

// Fallback 404 error handler
app.use((req, res, next) => {
  const err = new Error("Resource not found");
  err.status = 404;
  next(err);
});

// Centralized error handling
app.use(errorHandler);

export default app;
