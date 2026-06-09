import { Router } from "express";
import { uploadPhoto, getPhotos, deletePhoto, bulkDeletePhotos } from "../controllers/photo.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { uploadSingle } from "../middlewares/upload.middleware.js";
import { validatePhotoId } from "../validators/photo.validator.js";

const router = Router();

// Apply authMiddleware globally to all photo routes
router.use(authMiddleware);

router.post("/upload", uploadSingle, uploadPhoto);
router.get("/", getPhotos);
router.delete("/:id", validatePhotoId, deletePhoto);
router.post("/bulk-delete", bulkDeletePhotos);

export default router;
