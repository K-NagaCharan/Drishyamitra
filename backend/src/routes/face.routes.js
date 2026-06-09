import { Router } from "express";
import { getUnlabeledFaces, labelFace, getFaceSuggestion } from "../controllers/face.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

// Apply authMiddleware globally to all face management routes
router.use(authMiddleware);

router.get("/unlabeled", getUnlabeledFaces);
router.post("/:faceId/label", labelFace);
router.get("/:faceId/suggest", getFaceSuggestion);

export default router;
