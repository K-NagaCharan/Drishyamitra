# Drishyamitra — Environment Variables Reference Guide

This document lists and explains all configuration settings required to run the Drishyamitra system components locally and in production.

---

## 1. Backend Service Configuration (`backend/.env`)

Required by the Express API orchestration backend server.

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `5000` | Port on which the Node server listens. |
| `MONGO_URI` | Yes | - | MongoDB connection string (Atlas cluster or local instance). |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection URL for session storage and BullMQ queue orchestration. |
| `GROQ_API_KEY` | Yes | - | API key for Groq Cloud. |
| `CLOUDINARY_CLOUD_NAME`| Yes | - | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | Yes | - | Cloudinary public API key. |
| `CLOUDINARY_API_SECRET`| Yes | - | Cloudinary API secret key. |
| `GMAIL_USER` | No | - | SMTP Gmail username for email dispatch. |
| `GMAIL_APP_PASS` | No | - | App password for SMTP auth (required if Gmail SMTP is used). |
| `JWT_SECRET` | Yes | - | Secret key used to sign and verify JWT authentication tokens. |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiry duration (e.g., `7d`, `24h`). |
| `NODE_ENV` | No | `development` | Environment mode (`development` or `production`). |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend client origin URL to allow CORS headers. |
| `WHATSAPP_SESSION_PATH`| No | `./whatsapp-session` | Directory path where whatsapp-web.js session auth keys are cached. |
| `MAX_TOOL_DEPTH` | No | `5` | Loop iteration limit for the AI agent before it breaks out. |
| `MAX_HISTORY` | No | `20` | Cap on the number of chat messages kept in the context window. |
| `FACE_SERVICE_URL` | Yes | `http://localhost:5001` | The local or internal host URL for the Python face microservice. |
| `FACE_MATCH_THRESHOLD` | No | `0.72` | Cosine similarity threshold limit (0 to 1) for face matching clustering. |

---

## 2. Face Microservice Configuration (`face-service/.env`)

Required by the Python Flask face extraction service.

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `5001` | Port on which the Flask microservice runs. |
| `FACE_MODEL` | No | `Facenet512` | Face embedding generation model (insightface buffalo_l is utilized internally). |
| `DETECTOR_BACKEND` | No | `retinaface` | Face detection backend. |
| `DISTANCE_METRIC` | No | `cosine` | Math distance metric formula for comparing vectors (defaults to cosine). |
| `LOG_LEVEL` | No | `INFO` | Service console logging verbosity level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |

---

## 3. Frontend Client Configuration (`frontend/.env`)

Required by the Vite React application.

| Variable | Required? | Default | Description |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Yes | `http://localhost:5000/api/v1` | URL endpoint prefix for the Express backend API. |

---

## 4. Cross-Service Variable Dependencies Map

```
                     [ VITE_API_URL ]
                            │
                            ▼
                     [ Express API ] ◄──────► [ Redis Store ]
                            │                        │
       ┌────────────────────┼────────────────────────┼──────────────────┐
       ▼                    ▼                        ▼                  ▼
[ FACE_SERVICE_URL ]   [ MONGO_URI ]          [ REDIS_URL ]      [ GMAIL_USER ]
[ FACE_MATCH_THRESHOLD ]                      [ MAX_TOOL_DEPTH ] [ GMAIL_APP_PASS ]
[ JWT_SECRET ]                                [ MAX_HISTORY ]
```
