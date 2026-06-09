import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import Photo from "../src/models/Photo.js";
import { cosineSimilarity } from "../src/utils/cosineSimilarity.js";

async function main() {
  await connectDB();
  
  // Register Photo model
  const _ = Photo.modelName;

  const people = await Person.find({});
  
  console.log("--- WITHIN-PERSON SIMILARITY ANALYSIS ---");
  
  for (const person of people) {
    const faces = await Face.find({ personId: person._id }).populate("photoId");
    if (faces.length < 2) continue;
    
    let similarities = [];
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        try {
          const sim = cosineSimilarity(faces[i].embedding, faces[j].embedding);
          similarities.push(sim);
        } catch (err) {}
      }
    }
    
    if (similarities.length > 0) {
      similarities.sort((a, b) => a - b);
      const min = similarities[0];
      const max = similarities[similarities.length - 1];
      const avg = similarities.reduce((sum, val) => sum + val, 0) / similarities.length;
      console.log(`Person '${person.name}' (${faces.length} faces):`);
      console.log(`  Min Similarity: ${min.toFixed(4)}`);
      console.log(`  Max Similarity: ${max.toFixed(4)}`);
      console.log(`  Avg Similarity: ${avg.toFixed(4)}`);
    }
  }

  await mongoose.connection.close();
}

main();
