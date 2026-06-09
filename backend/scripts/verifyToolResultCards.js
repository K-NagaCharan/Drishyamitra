import app from "../src/app.js";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/config/logger.js";
import User from "../src/models/User.js";
import Photo from "../src/models/Photo.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";
import groq from "../src/config/groq.js";

const TEST_USER_EMAIL = "verify_cards_api_user@apes.com";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`[Assertion Failed] ${message}`);
    throw new Error(message);
  }
  logger.info(`[Assertion Passed] ${message}`);
};

const originalCreate = groq.chat.completions.create;

const setGroqMockResponses = (mockReturns) => {
  let callCount = 0;
  groq.chat.completions.create = async (options) => {
    const mockReturn = mockReturns[callCount];
    if (!mockReturn) {
      throw new Error(`Unexpected mock call index ${callCount}`);
    }
    callCount++;
    return mockReturn;
  };
};

const restoreGroq = () => {
  groq.chat.completions.create = originalCreate;
};

const runVerification = async () => {
  logger.info("Starting Chat API Tool Result Cards payload integration verification...");

  // Setup Database
  await connectDB();

  // Clear previous test users and data
  await User.deleteMany({ email: TEST_USER_EMAIL });
  const existingTester = await User.findOne({ email: TEST_USER_EMAIL });
  if (existingTester) {
    await Face.deleteMany({ userId: existingTester._id });
    await Person.deleteMany({ userId: existingTester._id });
    await Photo.deleteMany({ userId: existingTester._id });
  }

  // Create test user
  const testUser = new User({
    username: "cardsTester",
    email: TEST_USER_EMAIL,
    passwordHash: "dummyhash123"
  });
  await testUser.save();

  // Seed person "Dad"
  const personDad = new Person({
    userId: testUser._id,
    name: "Dad",
    nameNormalized: "dad"
  });
  await personDad.save();

  // Seed photo
  const testPhoto = new Photo({
    _id: new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad689d99"),
    userId: testUser._id,
    url: "https://res.cloudinary.com/dxgl7wq2e/image/upload/v1780996807/apes/photos/it9r9ttnr9or2omdm4fk.jpg",
    cloudinaryPublicId: "apes/photos/testphoto",
    width: 800,
    height: 600,
    status: "completed",
    uploadDate: new Date("2024-03-11T12:00:00Z")
  });
  await testPhoto.save();

  // Seed face coordinate
  const testFace = new Face({
    photoId: testPhoto._id,
    userId: testUser._id,
    personId: personDad._id,
    embedding: Array(512).fill(0.1),
    bbox: { x: 10, y: 10, w: 100, h: 100 },
    isLabeled: true
  });
  await testFace.save();

  // Generate valid JWT token
  const token = jwt.sign(
    { sub: testUser._id.toString(), type: "access" },
    env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Start temporary server
  const testPort = 5003;
  const server = app.listen(testPort, () => {
    logger.info(`Verification server listening on port ${testPort}`);
  });

  const url = `http://localhost:${testPort}/api/chat`;

  try {
    // -------------------------------------------------------------
    // TEST 1: Tool Call Response mapping to Cards (Exclude toolCalls)
    // -------------------------------------------------------------
    logger.info("--- Test 1: Tool result mapped to cards payload ---");
    setGroqMockResponses([
      // First call: requests searchPhotos tool
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_t1",
                  type: "function",
                  function: {
                    name: "searchPhotos",
                    arguments: JSON.stringify({ people: ["Dad"] })
                  }
                }
              ]
            }
          }
        ]
      },
      // Second call: returns final response text
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "I found 1 photo of Dad.",
              tool_calls: null
            }
          }
        ]
      }
    ]);

    const res1 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ message: "Show Dad's photos" })
    });

    const body1 = await res1.json();
    assert(res1.status === 200, "Valid request returns status 200");
    assert(body1.success === true, "ApiResponse success field is true");
    
    // Check fields in data
    const data = body1.data;
    assert(data.reply === "I found 1 photo of Dad.", "ApiResponse data contains correct reply");
    assert(Array.isArray(data.cards), "data.cards is returned as an array");
    assert(data.cards.length === 1, "data.cards contains exactly 1 mapped photo card");
    
    const card = data.cards[0];
    assert(card.type === "photo", "Card type is 'photo'");
    assert(card.id === "60c72b2f9b1d8b2bad689d99", "Card ID matches the seeded MongoDB photo ID");
    assert(card.thumbnailUrl === "https://res.cloudinary.com/dxgl7wq2e/image/upload/v1780996807/apes/photos/it9r9ttnr9or2omdm4fk.jpg", "Card thumbnailUrl matches real Cloudinary URL");
    assert(card.person === "Dad", "Card person matches mock returned person field");
    assert(card.date === "2024-03-11", "Card date matches mock returned date field");
    
    // Core architectural assert: internal toolCalls execution traces must not be exposed
    assert(data.toolCalls === undefined, "ApiResponse data must NOT expose internal 'toolCalls' array");

    // -------------------------------------------------------------
    // TEST 2: General Conversation Response without Tool Calls
    // -------------------------------------------------------------
    logger.info("--- Test 2: Standard response without cards field ---");
    setGroqMockResponses([
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hello! How can I help you today?",
              tool_calls: null
            }
          }
        ]
      }
    ]);

    const res2 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ message: "Hello" })
    });

    const body2 = await res2.json();
    assert(res2.status === 200, "Status is 200");
    assert(body2.success === true, "Success is true");
    assert(body2.data.reply === "Hello! How can I help you today?", "Reply text matches");
    assert(body2.data.cards === undefined, "Cards key is omitted when no photo search tool executes");
    assert(body2.data.toolCalls === undefined, "toolCalls is omitted");

    logger.info("ALL TOOL RESULT CARDS PAYLOAD INTEGRATION TESTS PASSED SUCCESSFULLY!");

  } finally {
    logger.info("Starting verification cleanup...");
    restoreGroq();
    await User.deleteMany({ email: TEST_USER_EMAIL });
    
    server.close(() => {
      logger.info("Verification server closed.");
    });

    await mongoose.connection.close();
    logger.info("Database connection closed.");
  }
};

runVerification().catch((err) => {
  logger.fatal(`Verification failed: ${err.message}`);
  mongoose.connection.close();
  process.exit(1);
});
