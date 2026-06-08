import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { generateToken } from "../utils/jwt.js";
import { successResponse, errorResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";

/**
 * Handle new user registration
 */
export const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  const lowercaseEmail = email.toLowerCase().trim();

  // Check email redundancy
  const existingUser = await User.findOne({ email: lowercaseEmail });
  if (existingUser) {
    return errorResponse(res, 400, "Email is already registered");
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = new User({
    username: username.trim(),
    email: lowercaseEmail,
    passwordHash
  });

  await user.save();

  // Issue token
  const token = generateToken(user._id);

  return res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: {
      token,
      expiresIn: env.JWT_EXPIRES_IN,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    }
  });
});

/**
 * Handle user credential authentication
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const lowercaseEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: lowercaseEmail });
  if (!user) {
    return errorResponse(res, 401, "Invalid email or password");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return errorResponse(res, 401, "Invalid email or password");
  }

  const token = generateToken(user._id);

  return successResponse(
    res,
    {
      token,
      expiresIn: env.JWT_EXPIRES_IN,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    },
    "Login successful"
  );
});

/**
 * Retrieve current logged in user details
 */
export const getMe = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    {
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email
      }
    },
    "User details retrieved successfully"
  );
});
