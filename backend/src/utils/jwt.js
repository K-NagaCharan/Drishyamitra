import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Generate a signed JWT access token for a user
 * @param {string} userId - Mongoose User ObjectID
 * @returns {string} - Signed JWT
 */
export const generateToken = (userId, username = "") => {
  return jwt.sign(
    {
      sub: userId,
      username: username,
      type: "access"
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN
    }
  );
};

/**
 * Verify a JWT and return its decoded payload
 * @param {string} token - Signed JWT
 * @returns {object} - Decoded payload
 */
export const verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};
