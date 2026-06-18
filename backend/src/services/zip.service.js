import { ZipArchive } from "archiver";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "../config/cloudinary.js";
import { logger } from "../config/logger.js";

/**
 * Structured error class for ZIP service operations.
 */
export class ZipServiceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ZipServiceError";
    this.code = details.code || "ZIP_SERVICE_ERROR";
    this.details = details;
  }
}

/**
 * Generates a ZIP archive in memory from Cloudinary-hosted photos and uploads it back to Cloudinary as a raw file.
 *
 * @param {object} params
 * @param {Array<object>} params.photos - Array of populated Photo documents containing at least `url` and `_id`.
 * @param {number} [params.concurrencyLimit=3] - Maximum number of concurrent downloads.
 * @returns {Promise<object>} Result containing zipUrl, cloudinaryPublicId, fileSize, and photoCount.
 */
export async function createZip({ photos, concurrencyLimit = 3 }) {
  // 1. Validation
  if (!photos || !Array.isArray(photos)) {
    throw new ZipServiceError("photos must be a valid array", { code: "INVALID_INPUT" });
  }
  if (photos.length === 0) {
    throw new ZipServiceError("photos array cannot be empty", { code: "INVALID_INPUT" });
  }

  // 2. Prepare task structures and determine filenames (with deduplication)
  const seenNames = new Set();
  const tasks = photos.map((photo, index) => {
    if (!photo || !photo.url || !photo._id) {
      throw new ZipServiceError("Invalid photo object: missing url or _id", {
        code: "INVALID_INPUT",
        photo
      });
    }

    let filename = "";
    if (photo.url) {
      try {
        const parsedUrl = new URL(photo.url);
        const pathname = parsedUrl.pathname;
        const basename = pathname.substring(pathname.lastIndexOf("/") + 1);
        if (basename && basename.includes(".") && !basename.startsWith(".")) {
          filename = basename;
        }
      } catch (err) {
        // Fallback if URL parsing fails
      }
    }

    // Fallback to photo-N.ext if filename could not be extracted
    if (!filename) {
      let ext = ".jpg";
      if (photo.url) {
        try {
          const parsedUrl = new URL(photo.url);
          const pathname = parsedUrl.pathname;
          const lastDot = pathname.lastIndexOf(".");
          if (lastDot !== -1) {
            const possibleExt = pathname.substring(lastDot).toLowerCase();
            if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(possibleExt)) {
              ext = possibleExt;
            }
          }
        } catch (err) {
          // Keep default .jpg
        }
      }
      filename = `photo-${index + 1}${ext}`;
    }

    // Ensure unique filenames inside the ZIP archive
    if (seenNames.has(filename)) {
      const dotIndex = filename.lastIndexOf(".");
      if (dotIndex !== -1) {
        const base = filename.substring(0, dotIndex);
        const ext = filename.substring(dotIndex);
        filename = `${base}_${index + 1}${ext}`;
      } else {
        filename = `${filename}_${index + 1}`;
      }
    }
    seenNames.add(filename);

    return {
      photo,
      filename,
      index
    };
  });

  // 3. Download images with limited concurrency using AbortController for cooperative cancellation
  const controller = new AbortController();
  const downloadedFiles = new Array(tasks.length);
  let currentIndex = 0;

  const downloadWorker = async () => {
    while (currentIndex < tasks.length) {
      const taskIndex = currentIndex++;
      const task = tasks[taskIndex];

      try {
        const response = await axios({
          method: "get",
          url: task.photo.url,
          responseType: "arraybuffer",
          timeout: 15000, // 15 seconds timeout
          signal: controller.signal
        });

        downloadedFiles[taskIndex] = {
          buffer: Buffer.from(response.data),
          filename: task.filename
        };
      } catch (err) {
        // If aborted, do not throw download failure unless it was the root cause
        if (axios.isCancel(err) || controller.signal.aborted) {
          return;
        }

        // Abort all other active downloads immediately
        controller.abort();

        throw new ZipServiceError(
          `Failed to download photo ${task.photo._id} from ${task.photo.url}: ${err.message}`,
          {
            code: "DOWNLOAD_FAILURE",
            photoId: task.photo._id,
            url: task.photo.url,
            originalError: err
          }
        );
      }
    }
  };

  try {
    const activeWorkers = Array.from(
      { length: Math.min(concurrencyLimit, tasks.length) },
      downloadWorker
    );
    await Promise.all(activeWorkers);
  } catch (err) {
    // Ensure controller is aborted in case of worker failure
    controller.abort();
    throw err;
  }

  // 4. Generate the ZIP archive in memory
  let zipBuffer;
  try {
    zipBuffer = await new Promise((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks = [];

      archive.on("data", (chunk) => chunks.push(chunk));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", (err) => {
        reject(
          new ZipServiceError(`ZIP compression failed: ${err.message}`, {
            code: "COMPRESSION_FAILURE",
            originalError: err
          })
        );
      });

      for (const file of downloadedFiles) {
        if (file && file.buffer) {
          archive.append(file.buffer, { name: file.filename });
        }
      }

      archive.finalize();
    });
  } catch (err) {
    throw err;
  }

  // 5. Upload the ZIP buffer to Cloudinary
  const fileUuid = uuidv4();
  const zipFilename = `delivery-${fileUuid}`;


  logger.info(
    { filename: zipFilename, sizeBytes: zipBuffer.length },
    "Uploading compiled ZIP archive to Cloudinary..."
  );

  const uploadResult = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "drishyamitra/deliveries",
        public_id: zipFilename,
        resource_type: "raw"
      },
      (error, result) => {
        if (error) {
          logger.error({ err: error }, "Cloudinary upload failed for ZIP raw archive");
          reject(
            new ZipServiceError(`Cloudinary upload failed: ${error.message}`, {
              code: "UPLOAD_FAILURE",
              originalError: error
            })
          );
        } else {
          resolve(result);
        }
      }
    );

    // End stream with buffer content
    uploadStream.end(zipBuffer);
  });

  const downloadUrl = uploadResult.secure_url.replace(
    "/raw/upload/",
    "/raw/upload/fl_attachment:shared_photos%252Ezip/"
  );

  return {
    zipUrl: downloadUrl,
    cloudinaryPublicId: uploadResult.public_id,
    fileSize: uploadResult.bytes,
    photoCount: photos.length
  };
}


export const zipHelpers = {
  createZip
};
