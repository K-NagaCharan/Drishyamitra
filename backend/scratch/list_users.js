import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import User from "../src/models/User.js";

async function main() {
  await connectDB();
  const users = await User.find({});
  console.log("Found users:");
  for (const user of users) {
    console.log(`ID: ${user._id}, Username: ${user.username}, Email: ${user.email}`);
  }
  await mongoose.connection.close();
}
main();
