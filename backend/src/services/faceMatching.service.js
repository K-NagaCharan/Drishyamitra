import Face from "../models/Face.js";
import Person from "../models/Person.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { cosineSimilarity } from "../utils/cosineSimilarity.js";

/**
 * l2Normalize
 * Normalizes a numerical vector so that its L2 norm (magnitude) is exactly 1.
 * 
 * @param {number[]} vector - 512-dimensional vector
 * @returns {number[]} L2-normalized vector
 */
export function l2Normalize(vector) {
  if (!Array.isArray(vector)) {
    throw new TypeError("Vector must be an array");
  }
  let sumSquares = 0.0;
  for (let i = 0; i < vector.length; i++) {
    const val = vector[i];
    if (typeof val !== "number" || Number.isNaN(val)) {
      throw new TypeError("Vector elements must be numbers");
    }
    sumSquares += val * val;
  }
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) {
    return new Array(vector.length).fill(0);
  }
  return vector.map(val => val / magnitude);
}

/**
 * updatePersonCentroid
 * Loads all manual faces for a person, normalizes their embeddings, computes the
 * L2-normalized centroid, and updates the Person document.
 * 
 * @param {string|object} personId - Person ObjectID
 * @returns {Promise<number[]|null>} The new centroid array, or null if no manual faces exist
 */
export async function updatePersonCentroid(personId) {
  const manualFaces = await Face.find({ personId, labelSource: "manual" })
    .select("embedding")
    .lean();

  if (manualFaces.length === 0) {
    await Person.findByIdAndUpdate(personId, {
      centroid: null,
      centroidCount: 0
    });
    logger.info({ personId }, "Reset centroid to null: no manual faces left");
    return null;
  }

  // 1. Normalize individual manual embeddings
  const normalizedEmbeddings = manualFaces.map(f => l2Normalize(f.embedding));

  // 2. Sum the normalized vectors
  const sumVec = new Array(512).fill(0);
  for (const emb of normalizedEmbeddings) {
    for (let i = 0; i < 512; i++) {
      sumVec[i] += emb[i];
    }
  }

  // 3. Average the vectors
  const avgVec = sumVec.map(v => v / normalizedEmbeddings.length);

  // 4. L2-normalize the resulting average vector
  const centroid = l2Normalize(avgVec);

  // 5. Update Person document
  await Person.findByIdAndUpdate(personId, {
    centroid,
    centroidCount: manualFaces.length
  });

  logger.info({ personId, manualCount: manualFaces.length }, "Recalculated centroid from manual faces");
  return centroid;
}

/**
 * addManualFaceToCentroid
 * Incrementally updates the centroid for a person with a new embedding.
 * Formula: centroid = normalized( (old * count + normalized(new)) / (count + 1) )
 * 
 * @param {string|object} personId - Person ObjectID
 * @param {number[]} newEmbedding - The raw embedding vector of the new manual face
 * @returns {Promise<number[]|null>} The updated centroid array
 */
export async function addManualFaceToCentroid(personId, newEmbedding) {
  const person = await Person.findById(personId);
  if (!person) {
    logger.warn({ personId }, "Failed to update centroid incrementally: Person not found");
    return null;
  }

  const normalizedNew = l2Normalize(newEmbedding);
  let newCentroid;
  let newCount;

  if (!person.centroid || person.centroid.length === 0 || person.centroidCount === 0) {
    newCentroid = normalizedNew;
    newCount = 1;
  } else {
    const oldCount = person.centroidCount;
    const oldCentroid = person.centroid;

    const tempCentroid = new Array(512);
    for (let i = 0; i < 512; i++) {
      tempCentroid[i] = (oldCentroid[i] * oldCount + normalizedNew[i]) / (oldCount + 1);
    }
    newCentroid = l2Normalize(tempCentroid);
    newCount = oldCount + 1;
  }

  person.centroid = newCentroid;
  person.centroidCount = newCount;
  await person.save();

  logger.info(
    { personId, oldCount: person.centroidCount - 1, newCount },
    "Incrementally updated centroid for person"
  );
  return newCentroid;
}

/**
 * findBestFaceMatch
 * Compares an input 512-dimension face embedding against all stored person centroids
 * using cosine similarity to identify a matched person.
 * 
 * @param {number[]} embedding - 512-dimensional array of numbers
 * @param {string|null} userId - Optional user ID to scope search
 * @returns {Promise<object>} Match result metadata
 */
export async function findBestFaceMatch(embedding, userId = null) {
  const startTime = Date.now();

  // 1. Enforce dimension constraints
  if (!Array.isArray(embedding) || embedding.length !== 512) {
    throw new Error("Input embedding must be an array of exactly 512 numbers");
  }

  for (let i = 0; i < embedding.length; i++) {
    const val = embedding[i];
    if (typeof val !== "number" || Number.isNaN(val)) {
      throw new TypeError("Embedding elements must be valid numbers");
    }
  }

  // 2. Query MongoDB for Person records with centroids
  const query = { centroid: { $ne: null } };
  if (userId) {
    query.userId = userId;
  }

  const people = await Person.find(query).lean();
  const durationMs = Date.now() - startTime;

  if (people.length === 0) {
    logger.info(
      { compared: 0, bestScore: null, matched: false, durationMs },
      "Face matching completed: no people centroids found in database"
    );
    return {
      matched: false,
      score: null
    };
  }

  let bestMatch = null;
  let bestScore = -1.0;

  // 3. Perform compare loop
  for (const person of people) {
    try {
      const similarity = cosineSimilarity(embedding, person.centroid);
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = person;
      }
    } catch (err) {
      logger.warn(
        { personId: person._id, err: err.message },
        "Failed comparing against stored person centroid, skipping item"
      );
    }
  }

  // Compare against PROPAGATION THRESHOLD for auto-labeling
  const isMatch = bestScore >= env.FACE_PROPAGATION_THRESHOLD;
  const finalDurationMs = Date.now() - startTime;

  logger.info(
    {
      compared: people.length,
      bestScore: parseFloat(bestScore.toFixed(4)),
      matched: isMatch,
      durationMs: finalDurationMs
    },
    "Face matching calculation complete against centroids"
  );

  if (isMatch && bestMatch) {
    return {
      matched: true,
      personId: bestMatch._id,
      score: bestScore
    };
  }

  return {
    matched: false,
    personId: bestMatch ? bestMatch._id : null,
    score: bestScore
  };
}

