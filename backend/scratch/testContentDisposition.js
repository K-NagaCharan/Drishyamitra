import cloudinary from "../src/config/cloudinary.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../src/config/logger.js";

async function main() {
  const dummyBuffer = Buffer.from("dummy zip contents");
  const fileUuid = uuidv4();
  const zipFilename = `delivery-${fileUuid}`; // No extension in public ID to bypass security block

  console.log("Uploading test raw asset...");
  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "drishyamitra/deliveries",
        public_id: zipFilename,
        resource_type: "raw",
        content_disposition: "attachment; filename=shared_photos.zip"
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(dummyBuffer);
  });

  const url = uploadResult.secure_url;
  console.log("Upload successful. URL:", url);
  console.log("Public ID:", uploadResult.public_id);

  try {
    console.log("Fetching URL to inspect headers...");
    const res = await axios.get(url);
    console.log("Fetch Status:", res.status);
    console.log("Content-Disposition Header:", res.headers['content-disposition']);
  } catch (err) {
    console.error("Fetch failed:", err.message);
  } finally {
    console.log("Cleaning up uploaded test raw asset...");
    await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: "raw" });
    console.log("Cleanup completed.");
    process.exit(0);
  }
}

main();
