import { verifyToken } from "../utils/jwt.js";
import User from "../models/User.js";
import { errorResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../config/logger.js";

/**
 * Express middleware to authenticate protected routes using JWT
 */
export const authMiddleware = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse(res, 401, "Access denied. No token provided.");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);

    // Assert token payload criteria
    if (decoded.type !== "access" || !decoded.sub) {
      return errorResponse(res, 401, "Access denied. Invalid token type.");
    }

    // Retrieve corresponding user, hiding passwordHash
    const user = await User.findById(decoded.sub).select("-passwordHash");
    if (!user) {
      return errorResponse(res, 401, "Access denied. User not found.");
    }

    req.user = user;
    next();
  } catch (err) {
    logger.warn(
      {
        requestId: req.id,
        error: err.message
      },
      "Authentication verification failed"
    );

    const isExpired = err.name === "TokenExpiredError";
    const errorMessage = isExpired ? "Token has expired" : "Authentication failed: Invalid token";
    return errorResponse(res, 401, errorMessage);
  }
});
