import Person from "../../models/Person.js";
import Face from "../../models/Face.js";
import Photo from "../../models/Photo.js";

/**
 * Live database execution for searchPhotos tool.
 */
export async function execute(args, userId) {
  if (!userId) {
    return [];
  }

  // 1. Build photo matching query
  const photoQuery = { userId, status: "completed" };

  // 2. Resolve matching people if provided
  if (args.people && args.people.length > 0) {
    const names = args.people.map(name => new RegExp(name.trim(), "i"));
    const matchedPeople = await Person.find({ userId, name: { $in: names } }).select("_id").lean();
    
    if (matchedPeople.length === 0) {
      // Named query target not found in DB
      return [];
    }
    
    const personIds = matchedPeople.map(p => p._id);
    const faces = await Face.find({ userId, personId: { $in: personIds }, isLabeled: true }).select("photoId").lean();
    
    if (faces.length === 0) {
      return [];
    }

    // Deduplicate photo IDs before database lookup to prevent duplicate cards
    const uniquePhotoIds = Array.from(new Set(faces.map(f => f.photoId ? f.photoId.toString() : null).filter(Boolean)));
    if (uniquePhotoIds.length === 0) {
      return [];
    }

    photoQuery._id = { $in: uniquePhotoIds };
  }

  // 3. Date range filters
  if (args.fromDate || args.toDate) {
    photoQuery.uploadDate = {};
    if (args.fromDate) {
      photoQuery.uploadDate.$gte = new Date(args.fromDate);
    }
    if (args.toDate) {
      photoQuery.uploadDate.$lte = new Date(args.toDate);
    }
  }

  // 4. Retrieve matching photos
  const photos = await Photo.find(photoQuery).sort({ uploadDate: -1 }).limit(20).lean();
  if (photos.length === 0) {
    return [];
  }

  // 5. Gather all labeled people for the matched photos to populate people names
  const photoIdsList = photos.map(p => p._id);
  const facesInPhotos = await Face.find({
    userId,
    photoId: { $in: photoIdsList },
    isLabeled: true,
    personId: { $ne: null }
  }).populate("personId", "name").lean();

  const photoPeopleMap = {};
  for (const face of facesInPhotos) {
    if (face.photoId && face.personId) {
      const pId = face.photoId.toString();
      if (!photoPeopleMap[pId]) {
        photoPeopleMap[pId] = new Set();
      }
      photoPeopleMap[pId].add(face.personId.name);
    }
  }

  // 6. Map to presentational cards structure
  return photos.map(photo => {
    const peopleNames = photoPeopleMap[photo._id.toString()] || new Set();
    return {
      id: photo._id.toString(),
      url: photo.url,
      date: photo.uploadDate ? photo.uploadDate.toISOString().split("T")[0] : "",
      people: Array.from(peopleNames)
    };
  });
}
