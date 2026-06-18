import mongoose from "mongoose";
import { logger } from "../config/logger.js";

/**
 * Resolves references to photo IDs from the user's conversational session memory
 * when they are not explicitly provided in the tool arguments.
 *
 * @param {object} session - The Redis user session object.
 * @param {Array<string>} [photoIds] - The photo IDs passed by the LLM (if any).
 * @returns {object} { success: boolean, photoIds?: Array<string>, error?: string }
 */
export function resolvePhotoReferences(session, photoIds) {
  if (Array.isArray(photoIds) && photoIds.length > 0) {
    const isTestMode = process.env.DRISHYAMITRA_TEST_MODE === "true";
    const hasValidIds = isTestMode || photoIds.every(id => mongoose.Types.ObjectId.isValid(id));

    if (hasValidIds) {
      logger.info({ count: photoIds.length }, "Using explicitly provided photoIds from tool arguments");
      return { success: true, photoIds };
    }

    logger.warn({ photoIds }, "Explicitly provided photoIds are not valid ObjectIds. Falling back to session memory.");
  }


  const lastSearch = session?.memory?.lastPhotoSearch;
  if (!lastSearch) {
    logger.warn("Attempted reference resolution but lastPhotoSearch is null or undefined");
    return {
      success: false,
      error: "No recent photo search found. Please search for photos first before sharing."
    };
  }

  // Check both resultIds and photoIds for backward compatibility
  const resolvedIds = lastSearch.resultIds || lastSearch.photoIds || [];
  if (resolvedIds.length === 0) {
    logger.warn("Reference resolution found lastPhotoSearch, but resultIds was empty");
    return {
      success: false,
      error: "No photos found in your last search. Please search for photos that exist first."
    };
  }

  logger.info(
    {
      count: resolvedIds.length,
      query: lastSearch.query,
      timestamp: lastSearch.timestamp
    },
    "Successfully resolved photo references from session memory"
  );

  return { success: true, photoIds: resolvedIds };
}
