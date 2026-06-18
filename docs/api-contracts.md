# Drishyamitra — API Contracts and Socket.io Events

This document details the REST endpoint structures, authentication requirements, request/response models, internal microservice schemas, and Socket.io event telemetry.

---

## 1. Authentication Endpoints

All endpoints are prefixed with `/api/v1`. Protected routes require a valid JSON Web Token (JWT) sent in the request headers: `Authorization: Bearer <Token>`.

### Register User
* **Path**: `POST /api/v1/auth/register`
* **Auth Required**: No
* **Request Body**:
```json
{
  "username": "johndoe",
  "email": "johndoe@example.com",
  "password": "strongpassword123"
}
```
* **Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "6a268c10...",
      "username": "johndoe",
      "email": "johndoe@example.com"
    }
  }
}
```
* **Error Response (400 Bad Request)**:
```json
{
  "success": false,
  "error": "Email is already registered"
}
```

### Login User
* **Path**: `POST /api/v1/auth/login`
* **Auth Required**: No
* **Request Body**:
```json
{
  "email": "johndoe@example.com",
  "password": "strongpassword123"
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "6a268c10...",
      "username": "johndoe",
      "email": "johndoe@example.com"
    }
  }
}
```
* **Error Response (401 Unauthorized)**:
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

### Current User Profile
* **Path**: `GET /api/v1/auth/me`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "6a268c10...",
      "username": "johndoe",
      "email": "johndoe@example.com"
    }
  }
}
```

---

## 2. Photo Ingestion & Management Endpoints

### Upload Photo
* **Path**: `POST /api/v1/photos/upload`
* **Auth Required**: Yes
* **Request Content-Type**: `multipart/form-data`
* **Body Form Data**: `file` (Binary Image File)
* **Success Response (202 Accepted)**:
```json
{
  "success": true,
  "message": "Photo uploaded successfully. Processing queued.",
  "photo": {
    "id": "6a29086f...",
    "url": "https://res.cloudinary.com/...",
    "status": "processing"
  },
  "jobId": "1"
}
```

### List Photos
* **Path**: `GET /api/v1/photos`
* **Auth Required**: Yes
* **Query Parameters**:
  - `limit` (number, default 30)
  - `skip` (number, default 0)
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "photos": [
    {
      "id": "6a29086f...",
      "url": "https://res.cloudinary.com/...",
      "status": "completed",
      "createdAt": "2026-06-10T15:00:00.000Z"
    }
  ]
}
```

### Delete Photo
* **Path**: `DELETE /api/v1/photos/:id`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Photo deleted successfully"
}
```

### Bulk Delete Photos
* **Path**: `POST /api/v1/photos/bulk-delete`
* **Auth Required**: Yes
* **Request Body**:
```json
{
  "ids": ["6a29086f...", "6a29087a..."]
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Photos deleted successfully"
}
```

### Get Photo Details
* **Path**: `GET /api/v1/photos/:id`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "photo": {
    "id": "6a29086f...",
    "url": "https://res.cloudinary.com/...",
    "status": "completed",
    "width": 1200,
    "height": 800,
    "bytes": 245600,
    "uploadDate": "2026-06-10T15:00:00.000Z"
  },
  "faces": [
    {
      "id": "6a29088a...",
      "bbox": { "x": 120, "y": 80, "w": 50, "h": 50 },
      "isLabeled": true,
      "personId": {
        "id": "6a290899...",
        "name": "Dad"
      }
    }
  ]
}
```

### Get Library Statistics
* **Path**: `GET /api/v1/photos/stats`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "photosCount": 120,
    "peopleCount": 8,
    "facesCount": 234,
    "unlabeledFacesCount": 14,
    "embeddingsCount": 234,
    "storageBytes": 34567890,
    "storageLimitBytes": 1073741824,
    "storagePercent": 3.2,
    "recentActivities": [
      {
        "message": "Recognized 2 faces in uploaded photo.",
        "timestamp": "2026-06-10T15:10:00.000Z"
      }
    ],
    "lastUpload": {
      "filename": "family_pic.jpg",
      "uploadedAt": "2026-06-10T15:00:00.000Z"
    }
  }
}
```

---

## 3. Face & People Labeling Endpoints

### List Labeled People
* **Path**: `GET /api/v1/faces/people` (or mapped at `/api/faces/people`)
* **Auth Required**: Yes
* **Success Response (200 OK)**:
```json
[
  {
    "id": "6a290899...",
    "name": "Dad",
    "avatarUrl": "https://res.cloudinary.com/...",
    "bbox": { "x": 120, "y": 80, "w": 50, "h": 50 }
  }
]
```

### List Unlabeled Faces
* **Path**: `GET /api/v1/faces/unlabeled`
* **Auth Required**: Yes
* **Query Parameters**:
  - `page` (number, default 1)
  - `limit` (number, default 20)
* **Success Response (200 OK)**:
```json
[
  {
    "faceId": "6a29088a...",
    "photoId": "6a29086f...",
    "photoUrl": "https://res.cloudinary.com/...",
    "bbox": { "x": 120, "y": 80, "w": 50, "h": 50 }
  }
]
```

### Get Face Suggestion
* **Path**: `GET /api/v1/faces/:faceId/suggest`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
```json
{
  "suggested": true,
  "personId": "6a290899...",
  "personName": "Dad",
  "similarity": 0.85
}
```

### Label Face
* **Path**: `POST /api/v1/faces/:faceId/label`
* **Auth Required**: Yes
* **Request Body**:
```json
{
  "personName": "Dad"
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Face labeled and centroids updated",
  "data": {
    "face": {
      "id": "6a29088a...",
      "isLabeled": true,
      "labelSource": "manual"
    },
    "person": {
      "id": "6a290899...",
      "name": "Dad"
    }
  }
}
```

### Get Photos of Person
* **Path**: `GET /api/v1/faces/people/:personId/photos`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
```json
{
  "personName": "Dad",
  "photos": [
    {
      "id": "6a29086f...",
      "url": "https://res.cloudinary.com/...",
      "status": "completed",
      "faceCount": 1,
      "uploadDate": "2026-06-10T15:00:00.000Z"
    }
  ]
}
```

---

## 4. Chat Endpoints

### Send Chat Query
* **Path**: `POST /api/chat` (and `/api/v1/chat`)
* **Auth Required**: Yes
* **Request Body**:
```json
{
  "message": "Show me Dad's photos from Diwali"
}
```
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Chat response generated successfully.",
  "data": {
    "reply": "I found 1 photo of Dad from Diwali.",
    "cards": [
      {
        "type": "photo",
        "id": "6a29086f...",
        "thumbnailUrl": "https://res.cloudinary.com/...",
        "people": ["Dad"],
        "person": "Dad",
        "date": "2023-11-12"
      }
    ]
  }
}
```

### Clear Chat History
* **Path**: `DELETE /api/chat` (and `/api/v1/chat`)
* **Auth Required**: Yes
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Chat history cleared successfully."
}
```

---

## 5. Delivery History & Operations Endpoints

### Get Delivery History
* **Path**: `GET /api/v1/delivery/history`
* **Auth Required**: Yes
* **Query Parameters**:
  - `page` (number, default 1)
  - `limit` (number, default 10)
  - `medium` (string: `email` or `whatsapp`)
  - `format` (string: `links` or `zip`)
  - `status` (string: `queued`, `delivered`, or `failed`)
* **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "_id": "6a290aa2...",
        "recipient": "mom@example.com",
        "medium": "email",
        "format": "zip",
        "count": 15,
        "status": "delivered",
        "createdAt": "2026-06-10T16:00:00.000Z",
        "deliveredAt": "2026-06-10T16:00:05.000Z",
        "zipUrl": "https://res.cloudinary.com/..."
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "pages": 1
    }
  },
  "message": "Delivery history retrieved successfully."
}
```

### Proxy/Download ZIP Delivery
* **Path**: `GET /api/v1/delivery/download/:deliveryId`
* **Auth Required**: No (Publicly accessible with proper signature/ID to support email links)
* **Success Response (200 OK)**: Streams raw binary ZIP payload directly from Cloudinary storage with response header `Content-Type: application/zip`.

---

## 6. Internal Face Microservice Interface (Node.js -> Python)

Internal endpoints exposed by the Flask face microservice (port 5001).

### Analyze/Recognize Bounding Boxes and Embeddings
* **Path**: `POST /recognize`
* **Request Body**:
```json
{
  "imageUrl": "https://res.cloudinary.com/..."
}
```
* **Success Response (200 OK)**:
```json
{
  "faces": [
    {
      "bbox": {
        "x": 120,
        "y": 80,
        "w": 50,
        "h": 50
      },
      "embedding": [0.0123, -0.0456, 0.0890, "...", 0.0021]
    }
  ]
}
```

### Flask Health Check
* **Path**: `GET /health`
* **Success Response (200 OK)**:
```json
{
  "status": "healthy",
  "model": "buffalo_l",
  "detector": "buffalo_l"
}
```

---

## 7. Socket.io Event Contracts

Websocket events emitted server-to-client, scoped to the authenticated user's private room: `socket.to(userId)`.

| Event Name | Direction | Payload Shape | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `recognition:progress` | Server -> Client | `{"jobId": String, "progress": Number, "photoId": String}` | Emitted periodically during background face detection execution. |
| `face:new` | Server -> Client | `{"faceId": String, "photoId": String, "bbox": Object, "jobId": String}` | Emitted immediately when an unknown face is registered. |
| `recognition:done` | Server -> Client | `{"success": Boolean, "jobId": String, "photoId": String, "totalFaces": Number, "matchedFaces": Number, "unknownFaces": Number}` | Emitted when a photo ingestion job finishes processing. |
| `delivery:started` | Server -> Client | `{"jobId": String, "deliveryId": String}` | Emitted when a background delivery job starts. |
| `delivery:done` | Server -> Client | `{"jobId": String, "success": true, "deliveryId": String}` | Emitted when Nodemailer or WhatsApp finishes delivery. |
| `delivery:failed` | Server -> Client | `{"jobId": String, "success": false, "deliveryId": String, "reason": String}` | Emitted when background delivery attempts crash. |
| `delivery:zip-confirm` | Server -> Client | `{"medium": String, "recipient": String, "count": Number, "totalMB": String, "limitMB": Number}` | Emitted when photo payload sizes exceed constraints. |
