# Engineering Decision Log

This document lists the architectural decisions made for Drishyamitra (Agentic Photos Evaluation and Segregation), the alternatives considered, and the technical justifications behind each selection.

---

| Core Decisional Area | Selection | Alternatives Considered | Technical Justification |
| :--- | :--- | :--- | :--- |
| **Face Recognition Runtime** | **Python (InsightFace)** | `face-api.js` (Node), DeepFace (Python) | InsightFace (Buffalo_L) accuracy and speed are superior to DeepFace and JS models under difficult lighting/angles. Keeping ML logic in Python mirrors standard production boundaries. |
| **Embedding Storage** | **MongoDB (Float Array)** | Qdrant, Pinecone | At a scale of <=10,000 faces, calculating cosine similarity in Node.js takes <=20ms. Avoids provisioning separate databases prematurely. |
| **Vector DB Scaling** | **Qdrant (v2 phase)** | MongoDB embeddings (permanently) | Deferring Qdrant prevents resume-padding. Qdrant is plan-scoped for v2 if database scale exceeds 50,000 embeddings. Schema design allows transparent query-layer migrations. |
| **Session & Chat Memory** | **Redis** | MongoDB | Session state has a 24-hour TTL, is highly mutable, and requires sub-millisecond reads. MongoDB's write overhead and disk persistence are unnecessary. |
| **Background Jobs Queue** | **BullMQ** | Celery, Synchronous API processing | Face detection takes 2-10 seconds per image. Synchronous API calls would block the event loop and crash HTTP requests. BullMQ is a Node-native, Redis-backed task manager. |
| **LLM Provider** | **Groq API** | OpenAI, Gemini | Groq's LPU provides ~800 tokens/sec, enabling real-time agent-loop performance. Offers a generous free tier for development. |
| **LLM Model Routing** | **Dual Model** | Single Model | Simple messages run on `llama-3.1-8b-instant` (low cost/latency). Complex messages containing actions use `llama-3.3-70b-versatile` (reliable tool-calling). |
| **Real-time Notifications** | **Socket.io** | Long Polling, SSE (Server-Sent Events) | BullMQ workers must push status changes (upload progress, unknown faces detected) back to clients asynchronously. Socket.io handles bidirectionality and scales well. |
| **Photo Assets Host** | **Cloudinary CDN** | AWS S3, Local storage | Cloudinary provides auto-image compression, simple URL transformations, and a robust free tier without IAM configuration overhead. |
| **Deployment Target** | **Managed Services (Railway / Vercel)** | Docker Compose on single VPS | Railway + Vercel deployment handles multi-service orchestration with zero operational overhead, allowing focus on core logic. |
| **Client UI Animations** | **Tailwind standard** | Framer Motion | Animations do not validate core agent or backend engineering capability. Priority is focused on queue execution and tool routing correctness. |
| **ZIP Compression** | **archiver + Cloudinary temp** | Server disk, base64 | No disk storage on server. Cloudinary temp raw asset with 24hr auto-delete. Streaming compression — no full buffer in memory during creation. |
| **ZIP Trigger** | **Socket.io confirmation** | Auto-send, HTTP polling | User must be informed and consent before unexpected format change. Socket.io is already in the stack. HTTP polling is wasteful for a one-time event. |
| **Size Check Method** | **Cloudinary bytes metadata** | Download and measure | Cloudinary stores the byte size of every asset. Reading it costs one DB query, not a download. Size check is essentially free. |

---

## Technical Trade-offs Acknowledged

### Polyglot Microservice Overhead
Managing two languages (Node.js and Python) adds operational complexity. This trade-off is accepted because InsightFace's accuracy gains over JS equivalents are critical to usability. The service boundaries are kept clean: Node.js communicates with Python solely through an internal port-to-port HTTP API.
