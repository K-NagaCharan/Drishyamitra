import { TOOLS } from "../src/agent/tools.js";
import { logger } from "../src/config/logger.js";

const assert = (condition, message) => {
  if (!condition) {
    logger.error(`[Assertion Failed] ${message}`);
    throw new Error(message);
  }
  logger.info(`[Assertion Passed] ${message}`);
};

const runVerification = async () => {
  logger.info("Starting tools definition layer verification tests...");

  // 1. Verify exact count
  assert(Array.isArray(TOOLS), "TOOLS should be an array");
  assert(TOOLS.length === 7, `Expected exactly 7 tools, got ${TOOLS.length}`);

  const expectedNames = [
    "searchPhotos",
    "getPeople",
    "sendEmail",
    "sendWhatsApp",
    "requestZipConfirmation",
    "confirmZipDelivery",
    "getDeliveryHistory"
  ];

  // 2. Verify structure of each tool
  TOOLS.forEach((tool, index) => {
    logger.info(`Validating tool at index ${index}...`);
    assert(tool.type === "function", `Tool type must be "function", got "${tool.type}"`);
    assert(tool.function && typeof tool.function === "object", "Tool must contain a function object");

    const fn = tool.function;
    assert(typeof fn.name === "string" && fn.name.length > 0, "Function name must be a non-empty string");
    assert(fn.name === expectedNames[index], `Expected tool at index ${index} to be "${expectedNames[index]}", got "${fn.name}"`);
    assert(typeof fn.description === "string" && fn.description.length > 0, "Function description must be a non-empty string");
    
    assert(fn.parameters && typeof fn.parameters === "object", "Function parameters must be an object");
    assert(fn.parameters.type === "object", `Function parameters type must be "object", got "${fn.parameters.type}"`);
    assert(fn.parameters.additionalProperties === false, "Function parameters additionalProperties must be false");
  });

  // 3. Stricter checks for specific tools
  logger.info("Validating individual tool schemas...");

  // searchPhotos
  const searchPhotos = TOOLS[0].function;
  assert(searchPhotos.parameters.properties.people.type === "array", "searchPhotos.people should be an array");
  assert(searchPhotos.parameters.properties.people.items.type === "string", "searchPhotos.people items type should be string");

  // sendEmail
  const sendEmail = TOOLS[2].function;
  assert(sendEmail.parameters.properties.photoIds.type === "array", "sendEmail.photoIds should be an array");
  assert(sendEmail.parameters.properties.photoIds.items.type === "string", "sendEmail.photoIds items type should be string");
  assert(sendEmail.parameters.properties.email.format === "email", "sendEmail.email format should be email");
  assert(Array.isArray(sendEmail.parameters.required) && sendEmail.parameters.required.includes("email"), "sendEmail required should include email");
  assert(!sendEmail.parameters.required.includes("photoIds"), "sendEmail required should NOT include photoIds");

  // sendWhatsApp
  const sendWhatsApp = TOOLS[3].function;
  assert(sendWhatsApp.parameters.properties.photoIds.type === "array", "sendWhatsApp.photoIds should be an array");
  assert(sendWhatsApp.parameters.properties.photoIds.items.type === "string", "sendWhatsApp.photoIds items type should be string");
  assert(Array.isArray(sendWhatsApp.parameters.required) && sendWhatsApp.parameters.required.includes("phoneNumber"), "sendWhatsApp required should include phoneNumber");
  assert(!sendWhatsApp.parameters.required.includes("photoIds"), "sendWhatsApp required should NOT include photoIds");

  // requestZipConfirmation
  const requestZip = TOOLS[4].function;
  assert(Array.isArray(requestZip.parameters.properties.deliveryMethod.enum), "requestZipConfirmation deliveryMethod should have enum array");
  assert(requestZip.parameters.properties.deliveryMethod.enum.includes("email"), "deliveryMethod enum should include email");
  assert(requestZip.parameters.properties.deliveryMethod.enum.includes("whatsapp"), "deliveryMethod enum should include whatsapp");
  assert(requestZip.parameters.properties.estimatedSizeMB.type === "number", "requestZipConfirmation estimatedSizeMB should be number");

  // confirmZipDelivery
  const confirmZip = TOOLS[5].function;
  assert(confirmZip.parameters.properties.sessionId.type === "string", "confirmZipDelivery sessionId should be a string");
  assert(confirmZip.parameters.properties.confirmed.type === "boolean", "confirmZipDelivery confirmed should be a boolean");
  assert(Array.isArray(confirmZip.parameters.required) && confirmZip.parameters.required.includes("sessionId") && confirmZip.parameters.required.includes("confirmed"), "confirmZipDelivery required properties are correct");

  // getDeliveryHistory
  const deliveryHistory = TOOLS[6].function;
  assert(deliveryHistory.parameters.properties.limit.type === "number", "getDeliveryHistory limit should be a number");

  console.log("\nTool definitions verified successfully.");
};

runVerification().catch((err) => {
  logger.fatal(`Verification failed: ${err.message}`);
  process.exit(1);
});
