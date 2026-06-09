import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import { cosineSimilarity } from "../src/utils/cosineSimilarity.js";

async function main() {
  await connectDB();
  
  const persons = await Person.find({}).lean();
  console.log(`=== PERSONS IN DB (${persons.length}) ===`);
  for (const p of persons) {
    const faceCount = await Face.countDocuments({ personId: p._id });
    console.log(`Person ID: ${p._id}, Name: "${p.name}", Normalized: "${p.nameNormalized}", Face Count: ${faceCount}`);
  }

  const labeledFaces = await Face.find({ personId: { $ne: null } }).lean();
  console.log(`\n=== LABELED FACES (${labeledFaces.length}) ===`);
  for (const face of labeledFaces) {
    const person = await Person.findById(face.personId);
    console.log(`Face: ${face._id}, Person: "${person ? person.name : 'Unknown'}", Photo: ${face.photoId}`);
  }

  await mongoose.connection.close();
}

main();
