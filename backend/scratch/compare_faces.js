import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import Photo from "../src/models/Photo.js";
import { cosineSimilarity } from "../src/utils/cosineSimilarity.js";

async function main() {
  await connectDB();
  const person = await Person.findOne({ name: "charan" });
  if (!person) {
    console.log("charan not found!");
    await mongoose.connection.close();
    return;
  }
  
  const faces = await Face.find({ personId: person._id }).populate("photoId");
  console.log(`Comparing ${faces.length} faces labeled as 'charan':`);
  
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const faceA = faces[i];
      const faceB = faces[j];
      if (!faceA.photoId || !faceB.photoId) continue;
      
      const similarity = cosineSimilarity(faceA.embedding, faceB.embedding);
      if (similarity >= 0.55) {
        console.log(
          `Face ${faceA._id} (BBox: ${JSON.stringify(faceA.bbox)}) in ${faceA.photoId.url}\n` +
          `  <-> Face ${faceB._id} (BBox: ${JSON.stringify(faceB.bbox)}) in ${faceB.photoId.url}\n` +
          `  => Similarity: ${similarity.toFixed(4)}`
        );
      }
    }
  }
  await mongoose.connection.close();
}
main();
