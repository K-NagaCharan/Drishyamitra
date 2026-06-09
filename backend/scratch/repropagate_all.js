import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import { propagateFaceLabel } from "../src/services/facePropagation.service.js";

async function main() {
  console.log("=== STARTING PROPAGATION RETRY FOR ALL LABELED FACES ===");
  await connectDB();

  // Find all labeled faces that have a personId
  const labeledFaces = await Face.find({ personId: { $ne: null }, isLabeled: true }).lean();
  console.log(`Found ${labeledFaces.length} labeled faces in MongoDB.`);

  let totalPropagated = 0;

  for (const face of labeledFaces) {
    console.log(`Propagating label for Face ID: ${face._id} (Person: ${face.personId})...`);
    try {
      const result = await propagateFaceLabel(face._id, face.personId, face.userId);
      if (result.propagated > 0) {
        console.log(`Successfully propagated to ${result.propagated} matching faces.`);
        totalPropagated += result.propagated;
      }
    } catch (err) {
      console.error(`Error during propagation for Face ${face._id}: ${err.message}`);
    }
  }

  console.log(`\n=== RETRY COMPLETED ===`);
  console.log(`Total new propagations executed: ${totalPropagated}`);

  await mongoose.connection.close();
  console.log("Database connection closed.");
}

main();
