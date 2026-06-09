import { executeTool } from "../src/agent/toolExecutor.js";
import { logger } from "../src/config/logger.js";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`[Assertion Failed] ${message}`);
    throw new Error(message);
  }
  logger.info(`[Assertion Passed] ${message}`);
};

const runVerification = async () => {
  logger.info("Starting tool executor verification tests...");

  // 1. Test searchPhotos
  logger.info("Testing searchPhotos...");
  const searchResult = await executeTool("searchPhotos", { people: ["Dad"] });
  assert(Array.isArray(searchResult), "searchPhotos should return an array");
  assert(searchResult.length === 1, "searchPhotos mock should return exactly 1 item");
  assert(searchResult[0].id === "photo_001", "Returned photo ID matches");
  assert(searchResult[0].person === "Dad", "Returned person matches");
  assert(searchResult[0].date === "2024-03-11", "Returned date matches");
  assert(searchResult[0].url === "mock://photo1", "Returned url matches");

  // 2. Test searchPhotos with undefined arguments (null/undefined safety check)
  logger.info("Testing searchPhotos with undefined args...");
  const searchResultNoArgs = await executeTool("searchPhotos", undefined);
  assert(Array.isArray(searchResultNoArgs) && searchResultNoArgs.length === 1, "searchPhotos works without args");

  // 3. Test getPeople
  logger.info("Testing getPeople...");
  const peopleResult = await executeTool("getPeople", {});
  assert(Array.isArray(peopleResult), "getPeople should return an array");
  assert(peopleResult.length === 3, "getPeople should return 3 people");
  assert(JSON.stringify(peopleResult) === JSON.stringify(["Dad", "Mom", "John"]), "getPeople matches expected list");

  // 4. Test sendEmail
  logger.info("Testing sendEmail...");
  const emailResult = await executeTool("sendEmail", { photoIds: ["photo_001"], email: "test@apes.com" });
  assert(typeof emailResult === "object", "sendEmail returns object");
  assert(emailResult.success === true, "sendEmail success is true");
  assert(emailResult.message === "Email queued successfully.", "sendEmail message is correct");

  // 5. Test sendWhatsApp
  logger.info("Testing sendWhatsApp...");
  const whatsappResult = await executeTool("sendWhatsApp", { photoIds: ["photo_001"], phoneNumber: "+123456789" });
  assert(typeof whatsappResult === "object", "sendWhatsApp returns object");
  assert(whatsappResult.success === true, "sendWhatsApp success is true");
  assert(whatsappResult.message === "WhatsApp delivery queued successfully.", "sendWhatsApp message is correct");

  // 6. Test requestZipConfirmation
  logger.info("Testing requestZipConfirmation...");
  const zipResult = await executeTool("requestZipConfirmation", { deliveryMethod: "email", estimatedSizeMB: 45 });
  assert(typeof zipResult === "object", "requestZipConfirmation returns object");
  assert(zipResult.requiresConfirmation === true, "requiresConfirmation should be true");
  assert(zipResult.estimatedSizeMB === 45, "estimatedSizeMB matches arguments");
  assert(zipResult.deliveryMethod === "email", "deliveryMethod matches arguments");

  // 7. Test unknown tool error
  logger.info("Testing unknown tool error...");
  try {
    await executeTool("unknownTool", {});
    assert(false, "Unknown tool should have thrown an error");
  } catch (error) {
    assert(error.message === 'Unknown tool "unknownTool"', `Correct error message received: ${error.message}`);
  }

  console.log("\nTool executor verified successfully.");
};

runVerification().catch((err) => {
  logger.fatal(`Verification failed: ${err.message}`);
  process.exit(1);
});
