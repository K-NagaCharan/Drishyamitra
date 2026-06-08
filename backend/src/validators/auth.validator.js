import { errorResponse } from "../utils/apiResponse.js";

const emailRegex = /^\S+@\S+\.\S+$/;

/**
 * Validator middleware for registering users
 */
export const validateRegister = (req, res, next) => {
  const { username, email, password } = req.body;

  if (!username || typeof username !== "string" || username.trim().length < 3) {
    return errorResponse(res, 400, "Username must be at least 3 characters long");
  }

  if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
    return errorResponse(res, 400, "Please provide a valid email address");
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    return errorResponse(res, 400, "Password must be at least 8 characters long");
  }

  if (password.length > 128) {
    return errorResponse(res, 400, "Password must not exceed 128 characters");
  }

  next();
};

/**
 * Validator middleware for logging in users
 */
export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
    return errorResponse(res, 400, "Please provide a valid email address");
  }

  if (!password || typeof password !== "string" || !password) {
    return errorResponse(res, 400, "Password is required");
  }

  next();
};
