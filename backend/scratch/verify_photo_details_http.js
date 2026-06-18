import mongoose from "mongoose";
import axios from "axios";
import { connectDB } from "../src/config/db.js";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Face from "../src/models/Face.js";
import Photo from "../src/models/Photo.js";
import Person from "../src/models/Person.js";
import { generateToken } from "../src/utils/jwt.js";

async function main() {
  console.log("=== STARTING HTTP DETAILS ENDPOINT VERIFICATION ===");

  await connectDB();

  const userId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689a01");
  const photoId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d01");
  const personId = new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689f01");

  const token = generateToken(userId.toString(), "user_test");

  const cleanDb = async () => {
    await Face.deleteMany({ userId });
    await Person.deleteMany({ userId });
    await Photo.deleteMany({ userId });
    await User.deleteMany({ _id: userId });
  };

  const seedData = async () => {
    const user = new User({
      _id: userId,
      username: "user_test",
      email: "usertest@example.com",
      passwordHash: "hash123"
    });
    await user.save();

    const person = new Person({
      _id: personId,
      userId,
      name: "Test Person",
      nameNormalized: "test person"
    });
    await person.save();

    const photo = new Photo({
      _id: photoId,
      userId,
      url: "https://res.cloudinary.com/demo/image/upload/v1234/apes/test.jpg",
      cloudinaryPublicId: "drishyamitra/photos/test",
      width: 1920,
      height: 1080,
      status: "completed"
    });
    await photo.save();

    const face = new Face({
      photoId,
      personId,
      userId,
      embedding: Array(512).fill(0.1),
      bbox: { x: 50, y: 50, w: 100, h: 100 },
      isLabeled: true
    });
    await face.save();
  };

  await cleanDb();
  await seedData();

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`Test server started on port ${port}`);

  const client = axios.create({
    baseURL: `http://localhost:${port}`,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true
  });

  try {
    console.log(`\n[TEST 1] GET /api/v1/photos/${photoId}...`);
    const res = await client.get(`/api/v1/photos/${photoId}`);
    console.log("Status:", res.status);
    console.log("Response Data:", JSON.stringify(res.data, null, 2));

    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }

    const details = res.data.data;
    if (!details || details.id !== photoId.toString()) {
      throw new Error("Invalid photo details returned");
    }

    if (!details.faces || details.faces.length !== 1) {
      throw new Error("Faces array missing or incorrect length");
    }

    const face = details.faces[0];
    if (face.person.name !== "Test Person") {
      throw new Error(`Expected person name 'Test Person', got '${face.person?.name}'`);
    }

    console.log("[TEST 1] PASSED.");
    
  } catch (err) {
    console.error("\nTEST SUITE CRITICAL FAILURE:", err.message);
    process.exit(1);
  } finally {
    await cleanDb();
    server.close();
    await mongoose.connection.close();
    console.log("Server stopped and database connection closed.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
