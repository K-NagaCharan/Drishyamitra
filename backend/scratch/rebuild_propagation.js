import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import Photo from "../src/models/Photo.js";
import { propagateFaceLabel } from "../src/services/facePropagation.service.js";
import { updatePersonCentroid } from "../src/services/faceMatching.service.js";

async function main() {
  const isCommit = process.argv.includes("--commit");
  console.log(`=== STARTING PROPAGATION REBUILD MIGRATION (Mode: ${isCommit ? "COMMIT" : "DRY-RUN"}) ===\n`);

  await connectDB();

  // Load all faces, persons, photos for in-memory checks
  const allFaces = await Face.find({}).lean();
  const allPhotos = await Photo.find({}).lean();
  const allPeople = await Person.find({}).lean();

  const photoIdSet = new Set(allPhotos.map(p => p._id.toString()));
  const personIdSet = new Set(allPeople.map(p => p._id.toString()));

  const orphanIds = [];
  const faceGroupsByPerson = {};

  console.log("Analyzing faces for orphans and label sources...");

  for (const face of allFaces) {
    let isOrphan = false;
    let reason = "";

    // Check userId
    if (!face.userId) {
      isOrphan = true;
      reason = "Missing userId";
    }
    // Check photoId existence
    else if (!face.photoId || !photoIdSet.has(face.photoId.toString())) {
      isOrphan = true;
      reason = face.photoId ? `Photo ${face.photoId} deleted` : "Missing photoId";
    }
    // Check personId existence if labeled
    else if (face.personId && !personIdSet.has(face.personId.toString())) {
      isOrphan = true;
      reason = `Person ${face.personId} deleted`;
    }

    if (isOrphan) {
      orphanIds.push({ id: face._id, reason, url: face.photoId ? face.photoId.toString() : "None" });
    } else if (face.personId) {
      // Valid labeled face: group by person
      const pId = face.personId.toString();
      if (!faceGroupsByPerson[pId]) {
        faceGroupsByPerson[pId] = [];
      }
      faceGroupsByPerson[pId].push(face);
    }
  }

  console.log(`\nFound ${orphanIds.length} orphan face(s) to purge:`);
  for (const orphan of orphanIds) {
    console.log(`  - Face ID: ${orphan.id} | Reason: ${orphan.reason}`);
  }

  const resetFaceIds = [];
  const manualAnchorFaces = [];

  console.log("\nEvaluating labeled faces groupings...");
  for (const pId of Object.keys(faceGroupsByPerson)) {
    const group = faceGroupsByPerson[pId];
    const personObj = allPeople.find(p => p._id.toString() === pId);
    const personName = personObj ? personObj.name : "Unknown";

    // Check if any face in the group is already explicitly manual
    const manualFaces = group.filter(f => f.labelSource === "manual");

    if (manualFaces.length > 0) {
      // Keep manual faces as manual anchors, reset all other faces to unlabeled
      console.log(`Person '${personName}': Found ${manualFaces.length} manual anchor(s). Preserving anchors and resetting ${group.length - manualFaces.length} propagated face(s).`);
      
      manualAnchorFaces.push(...manualFaces);
      
      const manualIds = new Set(manualFaces.map(f => f._id.toString()));
      for (const face of group) {
        if (!manualIds.has(face._id.toString())) {
          resetFaceIds.push(face._id);
        }
      }
    } else {
      // No manual anchor exists (e.g. initial migration state). Reset all faces in this group
      // so we do not guess the anchor, asking the user to relabel cleanly.
      console.log(`Person '${personName}': No manual labelSource exists. Resetting all ${group.length} face(s) to unlabeled for safety.`);
      for (const face of group) {
        resetFaceIds.push(face._id);
      }
    }
  }

  console.log("\n=== SUMMARY OF PROPOSED ACTIONS ===");
  console.log(`1. Purge Orphan Faces:    ${orphanIds.length}`);
  console.log(`2. Reset faces to Unlabeled: ${resetFaceIds.length}`);
  console.log(`3. Preserve Manual Anchors:  ${manualAnchorFaces.length}`);

  if (!isCommit) {
    console.log("\n[DRY-RUN] No changes were written. Re-run this script with the '--commit' flag to execute these updates.");
    await mongoose.connection.close();
    return;
  }

  // EXECUTION MODE
  console.log("\nExecuting updates in database...");

  // 1. Purge orphans
  if (orphanIds.length > 0) {
    const purgeResult = await Face.deleteMany({ _id: { $in: orphanIds.map(o => o.id) } });
    console.log(`Purged ${purgeResult.deletedCount} orphan face document(s).`);
  }

  // 2. Reset propagated/uncertain faces
  if (resetFaceIds.length > 0) {
    const resetResult = await Face.updateMany(
      { _id: { $in: resetFaceIds } },
      { $set: { personId: null, isLabeled: false, labelSource: null } }
    );
    console.log(`Reset ${resetResult.modifiedCount} face(s) to unlabeled state.`);
  }

  // 3. Mark manual anchors and save (if any existing manual anchor was identified)
  if (manualAnchorFaces.length > 0) {
    await Face.updateMany(
      { _id: { $in: manualAnchorFaces.map(f => f._id) } },
      { $set: { isLabeled: true, labelSource: "manual" } }
    );
    console.log(`Confirmed ${manualAnchorFaces.length} manual anchor face(s).`);

    // Recalculate centroids for all unique people who have manual anchors
    console.log("\nRecalculating centroids for manual anchors...");
    const uniquePersonIds = [...new Set(manualAnchorFaces.map(f => f.personId.toString()))];
    for (const personId of uniquePersonIds) {
      await updatePersonCentroid(personId);
    }

    // 4. Re-run propagation from manual anchors (grouped by person to use centroids)
    console.log("\nRe-triggering label propagation from preserved manual anchors...");
    let totalPropagated = 0;
    const anchorsByPerson = {};
    for (const anchor of manualAnchorFaces) {
      const pId = anchor.personId.toString();
      if (!anchorsByPerson[pId]) {
        anchorsByPerson[pId] = [];
      }
      anchorsByPerson[pId].push(anchor);
    }

    for (const pId of Object.keys(anchorsByPerson)) {
      const group = anchorsByPerson[pId];
      const anchor = group[0];
      try {
        const propResult = await propagateFaceLabel(anchor._id, anchor.personId, anchor.userId);
        if (propResult.propagated > 0) {
          console.log(`  Person ${pId} propagated to ${propResult.propagated} face(s).`);
          totalPropagated += propResult.propagated;
        }
      } catch (err) {
        console.error(`  Failed propagating for person ${pId}: ${err.message}`);
      }
    }
    console.log(`Completed propagation: ${totalPropagated} face(s) linked automatically.`);
  }

  // Clean up any Person documents that no longer have any labeled faces
  console.log("\nCleaning up unused Person profiles...");
  const remainingPeople = await Person.find({});
  let deletedPeopleCount = 0;
  for (const person of remainingPeople) {
    const faceCount = await Face.countDocuments({ personId: person._id, isLabeled: true });
    if (faceCount === 0) {
      await Person.deleteOne({ _id: person._id });
      deletedPeopleCount++;
      console.log(`  Deleted Person profile: '${person.name}' (no labeled faces remaining)`);
    }
  }
  console.log(`Deleted ${deletedPeopleCount} empty Person profile(s).`);

  await mongoose.connection.close();
  console.log("\n=== REBUILD COMPLETED SUCCESSFULLY ===");
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
