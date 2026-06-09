import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Photo from "../src/models/Photo.js";

async function main() {
  await connectDB();
  const photos = await Photo.find({}).sort({ uploadDate: -1 });
  console.log("--- PHOTOS IN DB ---");
  for (const photo of photos) {
    console.log(`ID: ${photo._id}`);
    console.log(`  URL: ${photo.url}`);
    console.log(`  uploadDate: ${photo.uploadDate}`);
    console.log(`  faceCount: ${photo.faceCount}`);
  }
  await mongoose.connection.close();
}
main();
