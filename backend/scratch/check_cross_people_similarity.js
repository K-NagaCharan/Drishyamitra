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

  const faces = await Face.find({ personId: { $ne: null } }).populate("personId").populate("photoId");
  console.log(`Loaded ${faces.length} labeled faces from DB.`);

  let highCrossSimilarities = [];

  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const faceA = faces[i];
      const faceB = faces[j];

      if (faceA.personId._id.toString() !== faceB.personId._id.toString()) {
        try {
          const sim = cosineSimilarity(faceA.embedding, faceB.embedding);
          if (sim >= 0.55) {
            highCrossSimilarities.push({
              faceA_id: faceA._id,
              faceA_person: faceA.personId.name,
              faceA_url: faceA.photoId ? faceA.photoId.url : "None",
              faceB_id: faceB._id,
              faceB_person: faceB.personId.name,
              faceB_url: faceB.photoId ? faceB.photoId.url : "None",
              similarity: sim
            });
          }
        } catch (err) {
          // ignore
        }
      }
    }
  }

  highCrossSimilarities.sort((a, b) => b.similarity - a.similarity);

  const top15 = highCrossSimilarities.slice(0, 15);

  console.log("\n--- High Similarities Between DIFFERENT People (Top 15, >= 0.55) ---");
  for (const match of top15) {
    console.log(
      `Person '${match.faceA_person}' (Face: ${match.faceA_id}, URL: ${match.faceA_url})\n` +
      `  <-> Person '${match.faceB_person}' (Face: ${match.faceB_id}, URL: ${match.faceB_url})\n` +
      `  => Similarity: ${match.similarity.toFixed(4)}`
    );
  }

  await mongoose.connection.close();
}

main();
