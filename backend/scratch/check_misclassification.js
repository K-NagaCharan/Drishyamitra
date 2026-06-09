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
  console.log(`Analyzing ${faces.length} faces for person: charan`);
  
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    console.log(`[Face ${i}] ID: ${face._id}, URL: ${face.photoId ? face.photoId.url : "None"}, BBox: ${JSON.stringify(face.bbox)}`);
  }

  console.log("\n--- Similarity Matrix ---");
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const faceA = faces[i];
      const faceB = faces[j];
      if (!faceA.photoId || !faceB.photoId) continue;
      const sim = cosineSimilarity(faceA.embedding, faceB.embedding);
      if (sim > 0.5) {
        console.log(`[Face ${i}] <-> [Face ${j}] = Similarity: ${sim.toFixed(4)}`);
      }
    }
  }

  await mongoose.connection.close();
}

main();
