import cloudinary from "../src/config/cloudinary.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

async function main() {
  const dummyBuffer = Buffer.from("dummy zip contents");
  const fileUuid = uuidv4();
  const zipFilename = `delivery-${fileUuid}`;

  console.log("Uploading test raw asset...");
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

  // Test 1: %2E (URL encoded period)
  const encodedUrl1 = baseSecureUrl.replace("/raw/upload/", "/raw/upload/fl_attachment:shared_photos%2Ezip/");
  console.log("\n--- Test 1: Fetching with fl_attachment:shared_photos%2Ezip ---");
  console.log("URL:", encodedUrl1);
  try {
    const res = await axios.get(encodedUrl1);
    console.log("Status:", res.status);
    console.log("Content-Disposition Header:", res.headers['content-disposition']);
  } catch (err) {
    console.error("Test 1 failed:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response headers:", err.response.headers);
    }
  }

  // Test 2: Double URL encoded period (%252E)
  const encodedUrl2 = baseSecureUrl.replace("/raw/upload/", "/raw/upload/fl_attachment:shared_photos%252Ezip/");
  console.log("\n--- Test 2: Fetching with fl_attachment:shared_photos%252Ezip ---");
  console.log("URL:", encodedUrl2);
  try {
    const res = await axios.get(encodedUrl2);
    console.log("Status:", res.status);
    console.log("Content-Disposition Header:", res.headers['content-disposition']);
  } catch (err) {
    console.error("Test 2 failed:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response headers:", err.response.headers);
    }
  }

  // Test 3: What if we append .zip at the end of public ID inside URL, but NOT in Cloudinary public ID?
  // Actually, Cloudinary returns 404/401 for that. We already tested it.

  // Cleanup
  console.log("\nCleaning up...");
  await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: "raw" });
  console.log("Cleanup completed.");
  process.exit(0);
}

main();
