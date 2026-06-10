import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import redis from "../src/config/redis.js";
import { env } from "../src/config/env.js";
import Photo from "../src/models/Photo.js";
import Face from "../src/models/Face.js";
import Person from "../src/models/Person.js";
import DeliveryHistory from "../src/models/DeliveryHistory.js";
import User from "../src/models/User.js";

dotenv.config({ path: path.resolve(".env") });

async function verify() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(env.MONGO_URI);
  console.log("Connected.");

  // Find a user to test with
  const testUser = await User.findOne();
  if (!testUser) {
    console.error("No users found in database!");
    await mongoose.disconnect();
    await redis.quit();
    return;
  }
  const userId = testUser._id;
  console.log(`Running stats verification for User: ${testUser.username} (${userId})`);

  // Aggregate storage size
  const storageStatsPromise = Photo.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, totalBytes: { $sum: { $ifNull: ["$bytes", 0] } } } }
  ]);

  // Execute queries in parallel
  const [
    photosCount,
    peopleCount,
    facesCount,
    unlabeledFacesCount,
    storageStats,
    lastPhoto,
    recentPhotos,
    recentPeople,
    recentDeliveries
  ] = await Promise.all([
    Photo.countDocuments({ userId }),
    Person.countDocuments({ userId }),
    Face.countDocuments({ userId }),
    Face.countDocuments({ userId, isLabeled: false }),
    storageStatsPromise,
    Photo.findOne({ userId }).sort({ uploadDate: -1 }).lean(),
    Photo.find({ userId }).sort({ uploadDate: -1 }).limit(5).lean(),
    Person.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
    DeliveryHistory.find({ userId }).sort({ createdAt: -1 }).limit(5).lean()
  ]);

  const storageBytes = storageStats.length > 0 ? storageStats[0].totalBytes : 0;
  const storageLimitBytes = env.STORAGE_LIMIT_BYTES || 10737418240; // 10 GB
  const storagePercent = parseFloat(((storageBytes / storageLimitBytes) * 100).toFixed(1));

  let lastUpload = null;
  if (lastPhoto) {
    lastUpload = {
      filename: lastPhoto.originalName || lastPhoto.url.split("/").pop() || "Photo",
      uploadedAt: lastPhoto.uploadDate
    };
  }

  // Construct dynamic activity feed
  const activities = [];

  // 1. Photo uploads & face detections & embeddings
  for (const p of recentPhotos) {
    const filename = p.originalName || p.url.split("/").pop() || "Photo";
    activities.push({
      type: "upload",
      message: `${filename} uploaded`,
      timestamp: p.uploadDate
    });
    if (p.faceCount > 0) {
      activities.push({
        type: "detection",
        message: `${p.faceCount} faces detected in ${filename}`,
        timestamp: p.uploadDate
      });
      activities.push({
        type: "embedding",
        message: `Embeddings generated for ${p.faceCount} faces`,
        timestamp: p.uploadDate
      });
    }
  }

  // 2. Labeled people
  for (const person of recentPeople) {
    activities.push({
      type: "label",
      message: `${person.name} labeled`,
      timestamp: person.createdAt
    });
  }

  // 3. Deliveries
  for (const d of recentDeliveries) {
    const statusText = d.status === "delivered" ? "completed" : d.status;
    const mediumName = d.medium === "whatsapp" ? "WhatsApp" : "Email";
    activities.push({
      type: "delivery",
      message: `${mediumName} delivery ${statusText}`,
      timestamp: d.createdAt
    });
  }

  // Sort chronologically (newest first) and limit to 5
  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const recentActivities = activities.slice(0, 5);

  const stats = {
    photosCount,
    peopleCount,
    facesCount,
    unlabeledFacesCount,
    embeddingsCount: facesCount,
    storageBytes,
    storageLimitBytes,
    storagePercent,
    lastUpload,
    recentActivities
  };

  console.log("\n--- AGGREGATED STATS RESULT ---");
  console.log(JSON.stringify(stats, null, 2));

  // Test Redis Set/Get
  const cacheKey = `test_stats:${userId}`;
  await redis.set(cacheKey, JSON.stringify(stats), "EX", 5);
  const retrieved = await redis.get(cacheKey);
  console.log("\n--- REDIS CACHE VERIFICATION ---");
  console.log("Redis cache write & read successful:", JSON.parse(retrieved).photosCount === photosCount);

  await mongoose.disconnect();
  await redis.quit();
  console.log("Disconnected successfully.");
}

verify().catch(console.error);
