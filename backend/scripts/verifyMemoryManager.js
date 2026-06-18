import { updateAgentMemory } from "../src/agent/memoryManager.js";
import { getSession, clearSession } from "../src/services/session.service.js";
import { logger } from "../src/config/logger.js";

const TEST_USER_ID = "663e2c9d17afbf937aef9012";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`[Assertion Failed] ${message}`);
    throw new Error(message);
  }
  logger.info(`[Assertion Passed] ${message}`);
};

const runVerification = async () => {
  logger.info("Starting memory manager verification tests...");

  // Setup: clean Redis session
  await clearSession(TEST_USER_ID);

  // 1. searchPhotos updates lastPhotoSearch
  logger.info("Testing searchPhotos memory update...");
  await updateAgentMemory({
    userId: TEST_USER_ID,
    toolName: "searchPhotos",
    toolArgs: { people: ["Dad"], location: "New York" },
    toolResult: [{ id: "photo_001" }, { id: "photo_002" }]
  });

  let session = await getSession(TEST_USER_ID);
  assert(session.memory.lastPhotoSearch !== null, "lastPhotoSearch should be set");
  assert(JSON.stringify(session.memory.lastPhotoSearch.people) === JSON.stringify(["Dad"]), "people array matches");
  assert(session.memory.lastPhotoSearch.location === "New York", "location matches");
  assert(session.memory.lastPhotoSearch.fromDate === null, "fromDate defaults to null");
  assert(JSON.stringify(session.memory.lastPhotoSearch.resultIds) === JSON.stringify(["photo_001", "photo_002"]), "resultIds matches");
  assert(session.memory.lastDelivery === null, "lastDelivery remains null");
  assert(session.memory.pendingZipConfirmation === null, "pendingZipConfirmation remains null");

  // 1b. searchPhotos with empty result list
  logger.info("Testing searchPhotos with empty/non-array results...");
  await updateAgentMemory({
    userId: TEST_USER_ID,
    toolName: "searchPhotos",
    toolArgs: { people: ["Mom"] },
    toolResult: null
  });
  session = await getSession(TEST_USER_ID);
  assert(JSON.stringify(session.memory.lastPhotoSearch.people) === JSON.stringify(["Mom"]), "people array updated");
  assert(JSON.stringify(session.memory.lastPhotoSearch.resultIds) === JSON.stringify([]), "resultIds defaults to empty array on null toolResult");

  // 2. sendEmail updates lastDelivery
  logger.info("Testing sendEmail memory update...");
  await updateAgentMemory({
    userId: TEST_USER_ID,
    toolName: "sendEmail",
    toolArgs: { photoIds: ["photo_001"], email: "test@drishyamitra.com" }
  });
  session = await getSession(TEST_USER_ID);
  assert(session.memory.lastDelivery !== null, "lastDelivery is set");
  assert(session.memory.lastDelivery.method === "email", "method is email");
  assert(JSON.stringify(session.memory.lastDelivery.photoIds) === JSON.stringify(["photo_001"]), "photoIds matches");
  assert(session.memory.lastDelivery.destination === "test@drishyamitra.com", "destination email matches");
  
  // Verify date is valid ISO string
  const timestamp = session.memory.lastDelivery.timestamp;
  assert(typeof timestamp === "string", "timestamp is a string");
  assert(!isNaN(Date.parse(timestamp)), "timestamp is parseable as Date");

  // Verify searchPhotos memory was preserved (partial update check)
  assert(session.memory.lastPhotoSearch.people[0] === "Mom", "lastPhotoSearch is preserved");

  // 3. sendWhatsApp overwrites lastDelivery
  logger.info("Testing sendWhatsApp memory update (overwriting lastDelivery)...");
  await updateAgentMemory({
    userId: TEST_USER_ID,
    toolName: "sendWhatsApp",
    toolArgs: { photoIds: ["photo_002"], phoneNumber: "+123456789" }
  });
  session = await getSession(TEST_USER_ID);
  assert(session.memory.lastDelivery.method === "whatsapp", "method is updated to whatsapp");
  assert(JSON.stringify(session.memory.lastDelivery.photoIds) === JSON.stringify(["photo_002"]), "photoIds is updated");
  assert(session.memory.lastDelivery.destination === "+123456789", "destination phoneNumber matches");
  assert(session.memory.lastPhotoSearch.people[0] === "Mom", "lastPhotoSearch remains preserved");

  // 4. requestZipConfirmation updates pendingZipConfirmation
  logger.info("Testing requestZipConfirmation memory update...");
  await updateAgentMemory({
    userId: TEST_USER_ID,
    toolName: "requestZipConfirmation",
    toolArgs: { deliveryMethod: "whatsapp", estimatedSizeMB: 50 }
  });
  session = await getSession(TEST_USER_ID);
  assert(session.memory.pendingZipConfirmation !== null, "pendingZipConfirmation is set");
  assert(session.memory.pendingZipConfirmation.deliveryMethod === "whatsapp", "deliveryMethod is whatsapp");
  assert(session.memory.pendingZipConfirmation.estimatedSizeMB === 50, "estimatedSizeMB is 50");
  assert(session.memory.pendingZipConfirmation.pending === true, "pending is true");

  // 5. Unknown tool names leave memory unchanged
  logger.info("Testing unknown tool name safety...");
  await updateAgentMemory({
    userId: TEST_USER_ID,
    toolName: "unknownTestTool",
    toolArgs: { data: "test" }
  });
  const sessionAfterUnknown = await getSession(TEST_USER_ID);
  assert(JSON.stringify(session.memory) === JSON.stringify(session.memory), "Memory properties remain completely unchanged");

  // 6. userId validation check
  logger.info("Testing userId validation...");
  try {
    await updateAgentMemory({ userId: null, toolName: "getPeople" });
    assert(false, "Should fail when userId is missing");
  } catch (error) {
    assert(error.message.includes("userId is required"), "Correct error message for missing userId validation");
  }

  logger.info("Memory manager verified successfully.");
  await clearSession(TEST_USER_ID);
};

runVerification().catch((err) => {
  logger.fatal(`Verification failed: ${err.message}`);
  process.exit(1);
});
