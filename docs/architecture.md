# Drishyamitra — System Architecture

This document describes the high-level design, component boundaries, background processing systems, and core workflows of the Drishyamitra (Agentic Photos Evaluation and Segregation) system.

---

## 1. System Overview

Drishyamitra is structured as a polyglot microservice architecture designed to handle photo storage, automatic face recognition, natural language retrieval, and action dispatching.

```mermaid
graph TD
    Client[React Client Vite] <-->|HTTP / Socket.io| Backend[Express API Server Node.js]
    Backend <-->|Session / Queue| Redis[(Redis / BullMQ)]
    Backend <-->|Metadata / Logs| Mongo[(MongoDB Atlas)]
    Backend -->|Internal HTTP| FaceService[Face Service Python / Flask]
    Backend -->|Media Store| Cloudinary[Cloudinary CDN]
    Backend -->|Delivery| Email[Nodemailer SMTP]
    Backend -->|Delivery| WA[whatsapp-web.js]
    Backend <-->|LLM Queries| Groq[Groq LPU API]
```

### Component Boundaries
* **React Client (Vite)**: Standard Single Page Application built on React, styled with Tailwind CSS v4.0. Renders the photo library gallery grid, crop canvas overlay for manual face labeling, real-time toast alerts, and a chat interface. Communicates via Socket.io and Axios.
* **Express API (Node.js)**: The orchestration core. Handles API routing, database schemas (via Mongoose), Socket.io connections, session caches, and the AI agent loop.
* **Python Face Service (Flask)**: Wrapper exposing face detection and embedding utilities. Accepts image URLs, downloads the image, extracts faces using the **InsightFace (buffalo_l)** library, applies IoU Non-Maximum Suppression (NMS) deduplication, and returns 512-dim embedding float arrays.
* **Redis (Upstash / Local)**: Dual namespace cache store:
  1. *BullMQ Job Queues*: Organizes asynchronous jobs for face ingestion, email/WhatsApp delivery, and temporary asset cleanup.
  2. *Session Store*: Caches agent conversation history and memory with a 24-hour TTL.
* **MongoDB Atlas**: Persistent database storing records for users, photos, faces, named personas, chat histories, and delivery audits.

---

## 2. Background Queue & Worker Architecture

To prevent long-running tasks from blocking the Express event loop, Drishyamitra uses a Redis-backed **BullMQ** job pipeline:

```
[Express API]
      │
      ├─► Add Job ──► [ recognitionQueue ] ──► [ recognition.worker.js ] ──► Socket.io Events
      │
      ├─► Add Job ──► [ deliveryQueue ] ──► [ delivery.worker.js ] ──► SMTP / WA
      │
      └─► Schedule ──► [ zipCleanupQueue ] ──► [ cleanupZip.worker.js ] ──► Cloudinary Purge
```

1. **`recognitionQueue`**:
   - Spawns a job whenever a photo is uploaded.
   - The worker calls the Python service, updates the database face embeddings, computes similarities, and pushes real-time telemetry back to the client via Socket.io.
2. **`deliveryQueue`**:
   - Handles photo delivery tasks asynchronously.
   - Invokes SMTP Nodemailer or whatsapp-web.js depending on the medium requested, updating the delivery record status on completion or failure.
3. **`zipCleanupQueue`**:
   - Runs a repeatable cron job (every 24 hours) to locate expired ZIP archives in `DeliveryHistory`, delete the raw ZIP assets from Cloudinary, and clear the database links.

---

## 3. Core Workflows

### Workflow A: Photo Upload & Ingestion Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User as React Client
    participant API as Express API
    participant Cloud as Cloudinary
    participant DB as MongoDB
    participant Queue as Redis (BullMQ)
    participant Worker as BullMQ Worker
    participant Python as Flask Face Service

    User->>API: POST /api/v1/photos/upload (Multipart FormData)
    API->>Cloud: Upload image buffer
    Cloud-->>API: Return secure URL & public ID
    API->>DB: Save Photo Document (status: 'processing')
    API->>Queue: Add job to 'recognitionQueue' { photoId, imageUrl }
    API-->>User: Return 202 Accepted (jobId)
    
    Note over Worker: Background worker picks up job
    Worker->>API: Emit socket event 'recognition:progress' (0%)
    Worker->>Python: POST /recognize { imageUrl }
    Python->>Python: Fetch image + InsightFace detection & embedding extraction
    Python-->>Worker: Return array of faces [ { bbox, embedding } ]
    Worker->>API: Emit socket event 'recognition:progress' (50%)
    
    loop Match Embeddings
        Worker->>DB: Load all existing Person centroids for user
        Worker->>Worker: Calculate cosine similarity against centroids
        alt Match Found (similarity >= threshold)
            Worker->>DB: Save Face { personId, userId, embedding, bbox, isLabeled: true }
        else No Match
            Worker->>DB: Save Face { personId: null, userId, embedding, bbox, isLabeled: false }
            Worker->>API: Emit socket event 'face:new'
        end
    end
    Worker->>DB: Update Photo status to 'completed', increment faceCount
    Worker->>API: Emit socket event 'recognition:progress' (100%)
    Worker->>API: Emit socket event 'recognition:done'
```

---

### Workflow B: Agent Query & Tool Calling Loop

```mermaid
sequenceDiagram
    autonumber
    actor User as React Client
    participant API as Express API (Agent Loop)
    participant Redis as Redis Session
    participant Groq as Groq LLM API
    participant Tools as Tool Handlers
    participant DB as MongoDB

    User->>API: POST /api/chat { message }
    API->>Redis: Get session (messages history & memory)
    API->>API: Select model (simple -> 8b, complex -> 70b)
    API->>Groq: Request completion (last 10 messages + tools definition)
    
    loop Agent Loop (Max 5 iterations)
        Groq-->>API: Finish Reason: 'tool_calls'
        API->>Tools: Parse arguments & execute tool (e.g. searchPhotos)
        Tools->>DB: Query Database
        Tools-->>API: Return result payload
        API->>Redis: Update session.memory.lastPhotoSearch
        API->>API: Append tool result message to history
        API->>Groq: Request completion again
    end
    
    Groq-->>API: Finish Reason: 'stop' (Final response text)
    API->>DB: Save ChatHistory (summary, userMessage, assistantReply)
    API->>Redis: Update session messages (TTL 24h)
    API-->>User: Return response JSON (reply, cards)
```

---

### Workflow C: Smart ZIP Delivery Confirmation Flow

This workflow illustrates how the system manages oversized deliveries (exceeding Gmail's 25MB or WhatsApp's 100MB limits).

```mermaid
sequenceDiagram
    autonumber
    actor User as React Client
    participant API as Express API
    participant Redis as Redis Session
    participant Queue as Redis (BullMQ)
    participant Worker as BullMQ Worker
    participant Cloud as Cloudinary

    User->>API: POST /api/chat {"message": "email these to mom@example.com"}
    Note over API: Agent resolves photo IDs from last search memory
    API->>API: Sum bytes field of selected photos
    Note over API: Sum exceeds 25MB medium threshold
    API->>Redis: Save pendingZipConfirmation in session
    API->>API: Emit socket event 'delivery:zip-confirm'
    API-->>User: Return "Awaiting confirmation..."
    Note over User: Client displays ZipConfirmModal overlay
    
    alt User Declines ZIP
        User->>API: POST /api/chat {"message": "cancel"} (or confirmZipDelivery tool called with confirmed: false)
        API->>Redis: Delete pendingZipConfirmation
        API-->>User: Return "Delivery request cancelled."
    else User Confirms ZIP
        User->>API: POST /api/chat {"message": "yes, send as ZIP"} (or confirmZipDelivery tool called with confirmed: true)
        API->>Redis: Retrieve & delete pendingZipConfirmation
        API->>DB: Save DeliveryHistory (status: 'queued', format: 'zip')
        API->>API: Compile ZIP streaming archive using 'archiver'
        API->>Cloud: Upload ZIP raw stream
        Cloud-->>API: Return raw ZIP URL
        API->>DB: Update DeliveryHistory (status: 'queued', zipUrl)
        API->>Queue: Add job to 'deliveryQueue' { requestId }
        API-->>User: Return "ZIP delivery queued successfully."
        Note over Worker: Background delivery worker processes job
        Worker->>API: Emit socket event 'delivery:started'
        Worker->>Worker: Dispatch Nodemailer Email containing ZIP URL
        Worker->>DB: Update DeliveryHistory (status: 'delivered', deliveredAt)
        Worker->>API: Emit socket event 'delivery:done'
    end
```
