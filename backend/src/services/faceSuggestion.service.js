import { findBestFaceMatch } from "./faceMatching.service.js";
import Person from "../models/Person.js";
import { env } from "../config/env.js";

/**
 * suggestFaceLabel
 * Automatically resolves the most visually similar Person identity
 * for an unlabeled face embedding using the existing matching infrastructure.
 * 
 * @param {number[]} embedding - 512-dimension vector array
 * @param {string|object} userId - Active user ObjectID for tenancy scoping
 * @returns {Promise<object>} Suggestion result payload
 */
export async function suggestFaceLabel(embedding, userId) {
  // 1. Search for best visual match
  const match = await findBestFaceMatch(embedding, userId);

  // 2. If score satisfies suggestion threshold, load name
  if (match.personId && match.score >= env.FACE_SUGGESTION_THRESHOLD) {
    const person = await Person.findById(match.personId).lean();
    if (person) {
      return {
        suggested: true,
        personId: match.personId,
        personName: person.name,
        score: match.score
      };
    }
  }

  // 3. Fallback to no suggestions
  return {
    suggested: false
  };
}

