import Person from "../models/Person.js";
import Face from "../models/Face.js";
import { logger } from "../config/logger.js";
import { propagateFaceLabel } from "./facePropagation.service.js";
import { addManualFaceToCentroid } from "./faceMatching.service.js";
import { ValidationError, AuthorizationError, NotFoundError } from "../utils/errors.js";

/**
 * labelFace
 * Associates an unknown detected Face with a named Person. Reuses existing
 * Person records of the same name (case-insensitive) for that user, or creates one.
 * 
 * @param {string|object} faceId - Face ObjectID to label
 * @param {string|object} userId - User ObjectID of the owner (tenant scope)
 * @param {string} personName - Name to assign to the face (e.g. "Dad", "Mom")
 * @returns {Promise<object>} Outcome containing person details and save status
 * @throws {TypeError|Error} On validation, authorization, or duplicate labeling errors
 */
export async function labelFace(faceId, userId, personName) {
  const startTime = Date.now();

  // 1. Validate name input type and dimensions
  if (typeof personName !== "string") {
    throw new ValidationError("Person name must be a string");
  }

  const trimmedName = personName.trim();
  if (trimmedName.length === 0) {
    throw new ValidationError("Person name cannot be empty or whitespace only");
  }

  if (trimmedName.length > 100) {
    throw new ValidationError("Person name cannot exceed 100 characters");
  }

  // 2. Retrieve the Face document
  const face = await Face.findById(faceId);
  if (!face) {
    throw new NotFoundError("Face not found");
  }

  // 3. Verify user tenancy ownership
  if (face.userId.toString() !== userId.toString()) {
    throw new AuthorizationError("Access denied. You do not own this face.");
  }

  // 4. Verify the face is not already labeled
  if (face.isLabeled) {
    throw new ValidationError("Face already labeled");
  }

  const normalized = trimmedName.toLowerCase();
  let person = null;
  let createdPerson = false;

  // 5. Look up existing Person record using the normalized name field
  person = await Person.findOne({ userId, nameNormalized: normalized });

  if (!person) {
    try {
      person = new Person({
        userId,
        name: trimmedName,
        nameNormalized: normalized
      });
      await person.save();
      createdPerson = true;
    } catch (err) {
      // 6. Concurrency / Race Condition Protection:
      // Handle MongoDB 11000 duplicate key error by querying the newly inserted record
      if (err.code === 11000) {
        person = await Person.findOne({ userId, nameNormalized: normalized });
        if (!person) {
          throw err; // Re-throw if it wasn't a duplicate key collision on this index
        }
        createdPerson = false;
      } else {
        throw err;
      }
    }
  }

  // 7. Update and save the Face document
  face.personId = person._id;
  face.isLabeled = true;
  face.labelSource = "manual";

  // Future:
  // Wrap this update inside a MongoDB transaction session
  // once the upload pipeline becomes transactional.
  await face.save();

  // Update centroid of the Person document with this manual label embedding
  await addManualFaceToCentroid(person._id, face.embedding);

  // Run automatic label propagation for other matching unlabeled faces
  const propagation = await propagateFaceLabel(face._id, person._id, userId);

  const durationMs = Date.now() - startTime;

  // 8. Logging metadata (excluding embedding vectors)
  logger.info(
    {
      faceId,
      personId: person._id,
      createdPerson,
      propagatedCount: propagation.propagated,
      durationMs
    },
    "Face successfully labeled and person associated"
  );

  return {
    success: true,
    faceId,
    personId: person._id,
    personName: person.name,
    createdPerson,
    propagated: propagation.propagated
  };
}
