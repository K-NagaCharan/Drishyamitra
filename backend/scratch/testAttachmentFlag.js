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

  // Cloudinary URL format for raw download with fl_attachment:
  // We insert 'fl_attachment:shared_photos' after 'raw/upload/'
  const cloudName = cloudinary.config().cloud_name;
  
  // Construct URL with fl_attachment:shared_photos
  // URL is typically: https://res.cloudinary.com/dxgl7wq2e/raw/upload/v1781110899/apes/deliveries/delivery-xxx
  // Let's replace 'raw/upload/' with 'raw/upload/fl_attachment:shared_photos/'
  const attachmentUrl = baseSecureUrl.replace("/raw/upload/", "/raw/upload/fl_attachment:shared_photos/");
  
  console.log("\n--- Test 3: Fetching URL with fl_attachment:shared_photos ---");
  console.log("URL:", attachmentUrl);
  try {
    const res = await axios.get(attachmentUrl);
    console.log("Status:", res.status);
    console.log("Content-Disposition Header:", res.headers['content-disposition']);
  } catch (err) {
    console.error("Test 3 failed:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response headers:", err.response.headers);
    }
  }

  // Construct URL with fl_attachment:shared_photos.zip
  const attachmentUrlZip = baseSecureUrl.replace("/raw/upload/", "/raw/upload/fl_attachment:shared_photos.zip/");
  console.log("\n--- Test 4: Fetching URL with fl_attachment:shared_photos.zip ---");
  console.log("URL:", attachmentUrlZip);
  try {
    const res = await axios.get(attachmentUrlZip);
    console.log("Status:", res.status);
    console.log("Content-Disposition Header:", res.headers['content-disposition']);
  } catch (err) {
    console.error("Test 4 failed:", err.message);
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
