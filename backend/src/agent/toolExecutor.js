import { execute as searchPhotos } from "./tools/searchPhotos.js";
import { execute as getPeople } from "./tools/getPeople.js";
import { execute as sendEmail } from "./tools/sendEmail.js";
import { execute as sendWhatsApp } from "./tools/sendWhatsApp.js";
import { execute as requestZipConfirmation } from "./tools/requestZipConfirmation.js";

/**
 * Dispatch an AI tool call to the appropriate tool implementation.
 *
 * @param {string} toolName - The name of the tool to execute.
 * @param {Object} [args] - The arguments passed to the tool.
 * @returns {Promise<any>} The result of the tool execution.
 * @throws {Error} If the toolName is not recognized.
 */
export async function executeTool(toolName, args) {
  // Safe argument handling
  const safeArgs = args ?? {};

  switch (toolName) {
    case "searchPhotos":
      return searchPhotos(safeArgs);

    case "getPeople":
      return getPeople(safeArgs);

    case "sendEmail":
      return sendEmail(safeArgs);

    case "sendWhatsApp":
      return sendWhatsApp(safeArgs);

    case "requestZipConfirmation":
      return requestZipConfirmation(safeArgs);

    default:
      throw new Error(`Unknown tool "${toolName}"`);
  }
}
