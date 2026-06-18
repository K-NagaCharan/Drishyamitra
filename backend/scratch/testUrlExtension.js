import cloudinary from "../src/config/cloudinary.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

async function main() {
  const dummyBuffer = Buffer.from("dummy zip contents");
  const fileUuid = uuidv4();
  const zipFilename = `delivery-${fileUuid}`; // No extension in public ID

  console.log("Uploading test raw asset with extensionless public ID...");
  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "drishyamitra/deliveries",
        public_id: zipFilename,
        resource_type: "raw"
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(dummyBuffer);
  });

  const baseSecureUrl = uploadResult.secure_url;
  console.log("Uploaded successfully. Base secure URL:", baseSecureUrl);
  console.log("Public ID:", uploadResult.public_id);

  // Test 1: Fetch base URL
  try {
    console.log("\n--- Test 1: Fetching base URL ---");
    const res = await axios.get(baseSecureUrl);
    console.log("Status:", res.status);
    console.log("Content-Disposition Header:", res.headers['content-disposition']);
  } catch (err) {
    console.error("Test 1 failed:", err.message);
  }

  // Test 2: Fetch base URL with .zip appended
  const urlWithZip = `${baseSecureUrl}.zip`;
  try {
    console.log("\n--- Test 2: Fetching URL with .zip appended ---");
    console.log("URL:", urlWithZip);
    const res = await axios.get(urlWithZip);
    console.log("Status:", res.status);
    console.log("Content-Disposition Header:", res.headers['content-disposition']);
  } catch (err) {
    console.error("Test 2 failed:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response headers:", err.response.headers);
    }
  }

  // Cleanup
  console.log("\nCleaning up...");
  await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: "raw" });
  console.log("Cleanup completed.");
  process.exit(0);
}

main();
