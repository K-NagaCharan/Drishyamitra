import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/drishyamitra";

async function run() {
  console.log("Connecting to:", MONGO_URI);
  await mongoose.connect(MONGO_URI);
  
  const Photo = mongoose.model("Photo", new mongoose.Schema({}, { strict: false }));
  const Face = mongoose.model("Face", new mongoose.Schema({}, { strict: false }));
  const Person = mongoose.model("Person", new mongoose.Schema({}, { strict: false }));
  
  const photosCount = await Photo.countDocuments();
  const facesCount = await Face.countDocuments();
  const peopleCount = await Person.countDocuments();
  
  console.log("Photos:", photosCount);
  console.log("Faces:", facesCount);
  console.log("People:", peopleCount);
  
  await mongoose.disconnect();
}

run().catch(console.error);
