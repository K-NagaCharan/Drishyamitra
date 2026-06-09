import { Server } from "socket.io";
import { verifyToken } from "../utils/jwt.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

let io = null;

/**
 * Initialize Socket.io and attach to HTTP server
 * @param {object} server - HTTP server instance
 */
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Authentication middleware for Socket.io connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      logger.warn({ socketId: socket.id }, "Socket connection rejected: Missing token");
      return next(new Error("Authentication error: Missing token"));
    }

    try {
      // Verify token
      const decoded = verifyToken(token);

      // Verify token type
      if (decoded.type !== "access" || !decoded.sub) {
        logger.warn({ socketId: socket.id }, "Socket connection rejected: Invalid token payload");
        return next(new Error("Authentication error: Invalid token"));
      }

      // Attach decoded payload to socket.user (prevents DB query on reconnect)
      socket.user = decoded;
      next();
    } catch (err) {
      logger.warn(
        { socketId: socket.id, error: err.message },
        "Socket connection rejected: Token verification failed"
      );

      const isExpired = err.name === "TokenExpiredError";
      const errorMessage = isExpired
        ? "Authentication error: Token expired"
        : "Authentication error: Invalid token";

      return next(new Error(errorMessage));
    }
  });

  io.on("connection", (socket) => {
    logger.info(
      {
        userId: socket.user.sub,
        username: socket.user.username || "N/A",
        socketId: socket.id
      },
      "Socket connected successfully"
    );

    socket.on("disconnect", (reason) => {
      logger.info(
        {
          userId: socket.user.sub,
          socketId: socket.id,
          reason
        },
        "Socket disconnected"
      );
    });
  });

  return io;
};

/**
 * Retrieve the active Socket.io Server instance
 * @returns {object} - Socket.io Server instance
 */
export const getIO = () => {
  return io;
};
