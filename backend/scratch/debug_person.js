import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import Photo from "../src/models/Photo.js";

async function main() {
  await connectDB();
  const person = await Person.findById("6a282e4ef06a355ad8b46c3f");
  if (!person) {
    console.log("Person not found!");
  } else {
    console.log(`Person: ${person.name}`);
    const faces = await Face.find({ personId: person._id }).populate("photoId");
    console.log(`Faces count: ${faces.length}`);
    for (const face of faces) {
      console.log(`- Face ID: ${face._id}`);
      console.log(`  Photo URL: ${face.photoId ? face.photoId.url : "None"}`);
      console.log(`  BBox: ${JSON.stringify(face.bbox)}`);
      console.log(`  isLabeled: ${face.isLabeled}`);
    }
  }
  await mongoose.connection.close();
}
main();
