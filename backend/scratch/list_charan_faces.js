import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import Photo from "../src/models/Photo.js";

async function main() {
  await connectDB();
  const person = await Person.findOne({ name: "charan" });
  if (!person) {
    console.log("charan not found!");
    await mongoose.connection.close();
    return;
  }
  
  const faces = await Face.find({ personId: person._id }).populate("photoId");
  console.log(`Faces for charan:`);
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    console.log(`[${i}] Face ID: ${f._id}`);
    console.log(`    Photo ID: ${f.photoId ? f.photoId._id : "None"}`);
    console.log(`    Photo URL: ${f.photoId ? f.photoId.url : "None"}`);
    console.log(`    BBox: ${JSON.stringify(f.bbox)}`);
  }
  await mongoose.connection.close();
}
main();
