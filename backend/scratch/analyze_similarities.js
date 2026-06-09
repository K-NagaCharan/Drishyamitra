import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import { cosineSimilarity } from "../src/utils/cosineSimilarity.js";

async function main() {
  await connectDB();
  const faces = await Face.find({}).lean();
  console.log(`Found ${faces.length} faces in MongoDB.`);

  console.log("\n--- Computing similarities between all pairs of faces ---");
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const faceA = faces[i];
      const faceB = faces[j];
      try {
        const similarity = cosineSimilarity(faceA.embedding, faceB.embedding);
        console.log(
          `Face ${faceA._id} (Photo: ${faceA.photoId}, Labeled: ${faceA.isLabeled}) <-> ` +
          `Face ${faceB._id} (Photo: ${faceB.photoId}, Labeled: ${faceB.isLabeled}) ` +
          `=> Similarity: ${similarity.toFixed(4)}`
        );
      } catch (err) {
        console.error(`Failed to compare ${faceA._id} and ${faceB._id}: ${err.message}`);
      }
    }
  }

  await mongoose.connection.close();
}

main();
