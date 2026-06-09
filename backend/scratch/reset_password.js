import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../src/config/db.js";
import User from "../src/models/User.js";

async function main() {
  await connectDB();
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("password123", salt);
  const result = await User.updateOne(
    { username: "charan" },
    { $set: { passwordHash } }
  );
  console.log("Update result:", result);
  await mongoose.connection.close();
}
main();
