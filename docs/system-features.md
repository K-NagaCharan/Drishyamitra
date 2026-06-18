# Drishyamitra — System Features & Storage Lifecycle

This document describes the visual interface maps, file storage pipelines, and advanced agent routing features implemented in the Drishyamitra system.

---

## 1. Frontend Application Map

The React web client ([AppRouter.jsx](file:///d:/Drishyamitra/frontend/src/router/AppRouter.jsx)) registers the following pages and interface utilities:

### A. Dashboard View (`/dashboard`)
* **Real-time Status Badge**: Displays Socket.io API connection state (`Connected` / `Offline`).
* **Library Statistics Widget**: Renders counts of uploaded photos, identified people, detected faces, unlabeled faces, stored vector embeddings, and total storage size.
* **Visual Storage Indicator**: Displays storage usage dynamically via a custom HTML5 progress bar and a retro block bar (`████░░░░`) computed from used bytes against a 1GB limit.
* **Recent Activity Log**: Shows a chronological list of recent ingestion status notifications, face labelings, and delivery dispatches.

### B. Gallery Feed (`/gallery`)
* **Chronological Photo Grid**: Renders user's photos, sorted by upload date.
* **Selection Mode**: Enables selecting multiple photos for bulk deletion.
* **ConfirmDeleteModal Overlay**: Displays photo details and a deletion confirm prompt. Supports bulk deletion counts.
* **PhotoDetailModal Carousel**: Displays a full screen view of the photo, bounding box coordinates overlays, and previous/next carousel controls to navigate the list.

### C. Person Gallery View (`/gallery/person/:personId`)
* Renders photos associated with a specific labeled person. Supports selection mode, bulk deletion, and the carousel details modal.

### D. Upload Dropzone (`/upload`)
* File drop area which queues multiple photo uploads to `POST /api/v1/photos/upload`. Shows active ingestion status progress.

### E. Face Labeling Page (`/faces`)
* Renders all unlabeled faces as crop cards showing bounding box face crops. Clicking a crop opens a modal showing name suggestions based on existing centroids. Submitting a name triggers label propagation.

### F. Conversational Chat Client (`/chat`)
* Exposes a chat interface for interaction with the Groq agent. Supports message history rendering, typing indicator states, and dynamic tool result grid cards showing photos matching query bounds.

---

## 2. Storage Lifecycle & ZIP Delivery Workflows

Drishyamitra manages photo sharing, file size constraints, and storage reclamation without local disk dependencies:

```
[Direct Photo Links] ◄──── [Email/WhatsApp Request] ────► [Size Check (>25MB Email / >100MB WA)]
                                                                  │
                                                                  ▼
                                                          [Emit delivery:zip-confirm]
                                                                  │
                                                                  ▼
                                                          [User Approves ZIP]
                                                                  │
                                                                  ▼
                                                      [Compile ZIP Raw Stream]
                                                                  │
                                                                  ▼
                                                      [Upload ZIP to Cloudinary]
                                                                  │
                                                                  ▼
                                                      [Add Delivery Worker Job]
                                                                  │
                                                                  ▼
                                                      [Nodemailer / WhatsApp Sent]
                                                                  │
                                                                  ▼
                                                       [Cron Cleanup: 24h Expire]
```

### A. Photo Hosting
- Original images are uploaded to Cloudinary. Secure URLs are stored in the database.
- Used bytes are recorded during upload to make check operations free.

### B. ZIP Compilation & Upload
- The system sums photo sizes using stored database byte sizes. If a size exceeds the platform limits (Gmail: 25MB, WhatsApp: 100MB), the agent asks for confirmation.
- On user approval, `archiver` downloads the photo streams from Cloudinary in parallel, compresses them into a raw ZIP stream in memory, and pipes the buffer directly to Cloudinary as a raw resource type inside the `zips` folder. No files are saved on the local server disk.
- Saves the secure Cloudinary ZIP URL and its `cloudinaryPublicId` in the `DeliveryHistory` document.

### C. Download Proxy Endpoint
- The route `GET /api/v1/delivery/download/:deliveryId` proxy-streams the ZIP file directly from Cloudinary.
- Sets the headers `Content-Type: application/zip` and `Content-Disposition: attachment; filename="drishyamitra_photos_[id].zip"`, renaming the extensionless Cloudinary Raw asset for the user.

### D. Scheduled Cleanup Worker
- To reclaim cloud storage, a repeatable BullMQ job (`cleanup-expired-zips` inside `cleanupZipQueue`) runs every 24 hours.
- Scans `DeliveryHistory` for ZIP records where `deliveredAt` is older than 24 hours.
- Calls `cloudinary.uploader.destroy(publicId, { resource_type: "raw" })` to delete the ZIP file.
- Clears `zipUrl` and `cloudinaryPublicId` fields in MongoDB, and records the `zipDeletedAt` timestamp.

---

## 3. Groq Agent Fallback Routing & Parsing Fail-safes

The conversational agent in [agentLoop.js](file:///d:/Drishyamitra/backend/src/agent/agentLoop.js) employs structural resilience:

### A. Model Selection Heuristics
- Messages are evaluated before routing:
  - Simple greetings/questions route to `llama-3.1-8b-instant` (low latency).
  - Queries containing keywords like `send`, `email`, `whatsapp`, `deliver`, or references like `these`/`them` route to `llama-3.3-70b-versatile` (reliable multi-step tool-calling).

### B. Rate Limit Fallbacks
- If a model hits a `429 Rate Limit` from Groq, the agent loop catches the error, marks the model as rate-limited, and automatically redirects the completion request to the alternative model (e.g. falling back from `70b` to `8b`) so that client requests succeed.

### C. Parsing Fail-safes (failed_generation)
- If Groq's JSON function parser fails on a tool call, the gateway returns a `400` status enclosing a raw `<function=name {jsonArgs}>` string.
- The agent loop intercepts this error, isolates the substring, parses the arguments manually, and executes the target tool handler, bypassing the API gateway's tool parser bug.
