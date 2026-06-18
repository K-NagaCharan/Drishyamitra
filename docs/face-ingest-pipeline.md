# Drishyamitra — Face Ingest & Recognition Pipeline

This document describes the end-to-end processing pipeline for uploaded photos, face detection, embedding matching, and label propagation.

---

## 1. Pipeline Overview

```
[React Client] ──► Upload Form ──► [Express API] ──► Upload to Cloudinary
                                         │
                                         ▼
                               [Add Ingestion Job]
                                         │
                                         ▼
                               [recognitionQueue]
                                         │
                                         ▼
                               [BullMQ Worker]
                                         │
                                         ├─► 25%: Call Python Face Service
                                         │        ├─► InsightFace buffalo_l
                                         │        └─► IoU Deduplication (NMS 0.70)
                                         │
                                         ├─► 50%: Calculate Cosine Similarity
                                         │        ├─► Match centroids (>= 0.72)
                                         │        └─► Save Face document
                                         │
                                         ├─► 75%: Trigger Socket Events
                                         │        ├─► face:new (if unlabeled)
                                         │        └─► Update Photo faceCount
                                         │
                                         └─► 100%: recognition:done
```

---

## 2. Step-by-Step Processing Pipeline

### Step 1: Upload and Asset Storage
- The user drops an image file into the React client upload dropzone.
- The client dispatches a `POST /api/v1/photos/upload` request with the multipart form payload.
- Express intercepts the binary payload using `multer` and streams it directly to Cloudinary.
- Cloudinary saves the image, returning metadata (dimensions, byte size, secure URL, public ID).
- Express registers a MongoDB `Photo` document with `status: 'processing'`, `bytes`, and `originalName`.

### Step 2: Ingestion Queue Scheduling
- Express enqueues a background job in the BullMQ `recognitionQueue` containing `{ photoId, imageUrl }`.
- The API responds to the client immediately with `202 Accepted` and the BullMQ `jobId`, allowing a non-blocking UI.
- The client listens to the Socket.io channel for real-time progress.

### Step 3: Face Detection & Embedding Generation
- The BullMQ worker picks up the job, emits `recognition:progress` (0%), and marks ready status (25%).
- The worker issues an internal `POST /recognize` request to the Python Flask microservice (port 5001).
- The Python microservice downloads the photo from Cloudinary.
- Runs **InsightFace (buffalo_l)**, which utilizes:
  - **RetinaFace** for face bounding box localization.
  - **ArcFace (w600k_r50)** to extract 512-dimensional float embeddings.
- Applies an Intersection over Union (IoU) Non-Maximum Suppression (NMS) algorithm (threshold `0.70`) to deduplicate face bounding boxes.
- Returns the list of detected faces `{ faces: [{ bbox, embedding }] }` to the worker. Progress is updated to 50%.

### Step 4: Vector Matching & Clustering (Cosine Similarity)
- The worker retrieves the embeddings of all named personas (`Person` documents) owned by the active user.
- For each face embedding returned, the worker calculates the **Cosine Similarity** against the user's stored Person centroids:
  $$\text{Similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$
- **Match Found**: If similarity is equal to or greater than `FACE_MATCH_THRESHOLD = 0.72`:
  - Registers the face: `Face` document created with `isLabeled: true`, `personId: matchedPersonId`, and `labelSource: "propagation"`.
  - Recalculates the centroid: The matched `Person` document's embedding centroid is updated dynamically using a running average weighted by the number of labeled faces.
- **No Match Found**: If similarity is less than `0.72`:
  - Registers as unlabeled: `Face` document created with `isLabeled: false` and `personId: null`.
  - Telemetry: Emits a `face:new` event via Socket.io, which prompts the user in the UI to label the face.

### Step 5: Finalization & Done Telemetry
- Updates the `Photo` document in MongoDB: `status` becomes `completed`, and `faceCount` is incremented.
- Emits `recognition:progress` (100%) and `recognition:done` events to the client.

---

## 3. Label Propagation & Centroid Recalculation

When a user manually assigns a name (e.g., "Dad") to an unlabeled face document `faceId` via `POST /api/v1/faces/:faceId/label`:
1. **Person Resolution**: 
   - Checks if a `Person` with `nameNormalized: "dad"` already exists. If not, creates one.
2. **First-Order Labeling**:
   - Updates the target Face document to `isLabeled: true`, `personId: person._id`, and `labelSource: "manual"`.
3. **Centroid Update**:
   - Fetches all labeled faces for this person.
   - Recalculates the 512-dim centroid vector by averaging all face embeddings. Updates the `centroid` and `centroidCount` fields on the `Person` document.
4. **Propagation Loop**:
   - Scans all remaining *unlabeled* Face documents belonging to the user.
   - Calculates cosine similarity between each unlabeled embedding and the newly updated centroid.
   - If similarity matches or exceeds the threshold (`0.72`), it automatically propagates the label to that face: updates the Face to `personId: person._id`, `isLabeled: true`, and `labelSource: "propagation"`.
   - The loop continues until no further matching unlabeled faces exist.
   - The centroid is updated once more at the end of propagation to reflect the newly grouped face cluster.
5. **Cache Purge**:
   - Deletes the dashboard stats cache key `stats:${userId}` in Redis to ensure updated counts show on the next dashboard render.
