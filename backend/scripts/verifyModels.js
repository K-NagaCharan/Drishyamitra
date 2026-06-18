import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/config/logger.js";
import User from "../src/models/User.js";
import Photo from "../src/models/Photo.js";
import Person from "../src/models/Person.js";
import Face from "../src/models/Face.js";

const runVerification = async () => {
  logger.info("Starting model layer verification tests...");

  // Setup connection
  await connectDB();

  // Clear previous test residue if any
  const testEmail = "verify_test_user_model@drishyamitra.com";
  await User.deleteMany({ email: testEmail });

  let testUser;
  let testPhoto;
  let testPerson;
  let testFace;

  try {
    // -------------------------------------------------------------
    // TEST 1: Schema Validation (User email validation, uniqueness)
    // -------------------------------------------------------------
    logger.info("--- Testing User Schema and Email Validations ---");

    // Invalid email check
    try {
      const invalidUser = new User({
        username: "test",
        email: "malformed-email-string",
        passwordHash: "dummyhash123"
      });
      await invalidUser.validate();
      throw new Error("Validation check failed: Accepted invalid email format");
    } catch (err) {
      if (err.errors && err.errors.email) {
        logger.info("PASSED: Invalid email format successfully rejected.");
      } else {
        throw err;
      }
    }

    // Missing field validation check
    try {
      const missingUser = new User({
        email: testEmail,
        passwordHash: "dummyhash123"
      });
      await missingUser.validate();
      throw new Error("Validation check failed: Accepted missing required username field");
    } catch (err) {
      if (err.errors && err.errors.username) {
        logger.info("PASSED: Missing required username field successfully rejected.");
      } else {
        throw err;
      }
    }

    // Valid User insert
    testUser = new User({
      username: "verifyTestUser",
      email: testEmail,
      passwordHash: "dummyhash123"
    });
    await testUser.save();
    logger.info("PASSED: Valid User successfully saved to database.");

    // Duplicate email check
    try {
      const dupUser = new User({
        username: "dupUser",
        email: testEmail,
        passwordHash: "dummyhash456"
      });
      await dupUser.save();
      throw new Error("Index check failed: Accepted duplicate unique email entry");
    } catch (err) {
      if (err.code === 11000) {
        logger.info("PASSED: Duplicate user email insertion rejected by index constraint.");
      } else {
        throw err;
      }
    }

    // -------------------------------------------------------------
    // TEST 2: Compound Unique Index Validation (Person userId + name uniqueness)
    // -------------------------------------------------------------
    logger.info("--- Testing Person Unique Compound Index ---");
    testPerson = new Person({
      userId: testUser._id,
      name: "Dad"
    });
    await testPerson.save();
    logger.info("PASSED: First Person saved successfully.");

    try {
      const dupPerson = new Person({
        userId: testUser._id,
        name: "Dad"
      });
      await dupPerson.save();
      throw new Error("Index check failed: Accepted duplicate person name for same user");
    } catch (err) {
      if (err.code === 11000) {
        logger.info("PASSED: Duplicate named person for same user rejected successfully.");
      } else {
        throw err;
      }
    }

    // -------------------------------------------------------------
    // TEST 3: Embedding Validation (Face Embedding Size Validation)
    // -------------------------------------------------------------
    logger.info("--- Testing Face Embedding Array Validation ---");
    testPhoto = new Photo({
      userId: testUser._id,
      url: "https://res.cloudinary.com/demo/image/upload/v1234/apes/photo.jpg",
      cloudinaryPublicId: "test_public_id",
      width: 1920,
      height: 1080,
      status: "completed",
      faceCount: 1
    });
    await testPhoto.save();

    // Invalid embedding array size check
    try {
      const invalidFace = new Face({
        photoId: testPhoto._id,
        userId: testUser._id,
        embedding: [0.1, 0.2, 0.3], // Size 3 instead of default 512
        embeddingDimension: 512,
        bbox: { x: 5, y: 10, w: 15, h: 20 }
      });
      await invalidFace.save();
      throw new Error("Validation check failed: Accepted embedding array sizes mismatch");
    } catch (err) {
      if (err.errors && err.errors.embedding) {
        logger.info("PASSED: Size-mismatched embedding successfully rejected.");
      } else {
        throw err;
      }
    }

    // Valid embedding vector (512 entries)
    const validVector = Array(512).fill(0.001);
    testFace = new Face({
      photoId: testPhoto._id,
      personId: testPerson._id,
      userId: testUser._id,
      embedding: validVector,
      embeddingDimension: 512,
      bbox: { x: 5, y: 10, w: 15, h: 20 },
      isLabeled: true
    });
    await testFace.save();
    logger.info("PASSED: Valid face matching embedding size saved.");

    // -------------------------------------------------------------
    // TEST 4: Relationship Validation (Refs and Populates)
    // -------------------------------------------------------------
    logger.info("--- Testing Entity Relationships and Populates ---");
    const populatedFace = await Face.findById(testFace._id)
      .populate("photoId")
      .populate("personId")
      .populate("userId");

    if (
      populatedFace.userId.username === "verifyTestUser" &&
      populatedFace.photoId.url === "https://res.cloudinary.com/demo/image/upload/v1234/apes/photo.jpg" &&
      populatedFace.personId.name === "Dad"
    ) {
      logger.info("PASSED: Relationships resolved successfully via Mongoose populate.");
    } else {
      throw new Error("Query verification failed: Populate did not link ref correctly");
    }

    // -------------------------------------------------------------
    // TEST 5: Index Validation (Collection Index Check)
    // -------------------------------------------------------------
    logger.info("--- Testing Index Existence in Database ---");
    const userIndexes = await User.collection.indexes();
    const photoIndexes = await Photo.collection.indexes();
    const faceIndexes = await Face.collection.indexes();
    const personIndexes = await Person.collection.indexes();

    const containsIndex = (indexList, targetFields) => {
      return indexList.some((idx) => {
        const idxKeys = Object.keys(idx.key);
        return (
          idxKeys.length === targetFields.length &&
          idxKeys.every((k, i) => k === targetFields[i])
        );
      });
    };

    if (
      containsIndex(userIndexes, ["email"]) &&
      containsIndex(photoIndexes, ["userId", "uploadDate"]) &&
      containsIndex(photoIndexes, ["userId"]) &&
      containsIndex(photoIndexes, ["status"]) &&
      containsIndex(personIndexes, ["userId", "name"]) &&
      containsIndex(faceIndexes, ["personId"]) &&
      containsIndex(faceIndexes, ["photoId"]) &&
      containsIndex(faceIndexes, ["isLabeled"]) &&
      containsIndex(faceIndexes, ["userId"])
    ) {
      logger.info("PASSED: All indexes confirmed to exist in MongoDB.");
    } else {
      logger.error({ userIndexes, photoIndexes, faceIndexes, personIndexes }, "Failed Index Dump");
      throw new Error("Failed Index Check: One or more indexes are missing in DB.");
    }

    logger.info("ALL DATABASE MODEL VALIDATION TESTS COMPLETED SUCCESSFULLY!");

  } finally {
    logger.info("Starting cleanup of verify test documents...");
    
    // DB document cleanup to prevent pollution
    if (testFace) await Face.deleteOne({ _id: testFace._id });
    if (testPerson) await Person.deleteOne({ _id: testPerson._id });
    if (testPhoto) await Photo.deleteOne({ _id: testPhoto._id });
    if (testUser) await User.deleteOne({ _id: testUser._id });

    await mongoose.connection.close();
    logger.info("Database connection closed.");
  }
};

runVerification().catch((err) => {
  logger.error(err, "CRITICAL: Database model verification run failed with error");
  mongoose.connection.close();
  process.exit(1);
});
