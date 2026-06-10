import { Router } from "express";
import { uploadPhoto, getPhotos, deletePhoto, bulkDeletePhotos, getPhotoDetails, getPhotoStats } from "../controllers/photo.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { uploadSingle } from "../middlewares/upload.middleware.js";
import { validatePhotoId } from "../validators/photo.validator.js";
import { getIO } from "../socket/index.js";
import { emitRecognitionProgress, emitRecognitionDone } from "../socket/events.js";

const router = Router();

// Apply authMiddleware globally to all photo routes
router.use(authMiddleware);

router.post("/upload", uploadSingle, uploadPhoto);
router.get("/", getPhotos);
router.get("/stats", getPhotoStats);
router.get("/:id", validatePhotoId, getPhotoDetails);
router.delete("/:id", validatePhotoId, deletePhoto);
router.post("/bulk-delete", bulkDeletePhotos);

// Simulation route for Sprint 3.5 verification
router.post("/test-progress-trigger", (req, res) => {
  const io = getIO();
  const userId = req.user._id;
  const { photoId } = req.body;
  const jobId = "sim-job-" + Math.random().toString(36).substring(2, 9);

  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 100) {
      emitRecognitionProgress(io, userId, { jobId, progress, photoId });
      progress += 25;
    } else {
      emitRecognitionProgress(io, userId, { jobId, progress: 100, photoId });
      clearInterval(interval);
      setTimeout(() => {
        emitRecognitionDone(io, userId, {
          success: true,
          jobId,
          photoId,
          totalFaces: 2,
          matchedFaces: 1,
          unknownFaces: 1
        });
      }, 1000);
    }
  }, 1000);

  res.json({ success: true, jobId });
});

export default router;
