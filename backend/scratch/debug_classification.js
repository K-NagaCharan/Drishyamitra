import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import Photo from "../src/models/Photo.js";
import { cosineSimilarity } from "../src/utils/cosineSimilarity.js";

async function main() {
  await connectDB();
  
  const people = await Person.find({});
  console.log("--- PEOPLE IN DB ---");
  for (const person of people) {
    console.log(`Person: ${person.name} (${person._id})`);
    const faces = await Face.find({ personId: person._id }).populate("photoId");
    console.log(`  Associated Faces Count: ${faces.length}`);
    for (const face of faces) {
      console.log(`    Face ID: ${face._id}`);
      console.log(`      Photo ID: ${face.photoId ? face.photoId._id : "None"}`);
      console.log(`      Photo URL: ${face.photoId ? face.photoId.url : "None"}`);
      console.log(`      BBox: ${JSON.stringify(face.bbox)}`);
    }
  }

  await mongoose.connection.close();
}

main();
