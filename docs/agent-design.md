# Agent Loop and Tool Calling Design

This document details the Groq AI agent configuration, tool definitions, session state structures, state injection strategies, and failure-handling strategies.

---

## 1. Groq Tool Definitions

The Groq agent is configured with 7 functional tools. These schemas are parsed by Groq to validate parameters before dispatching tool calls to the Express application.

### Tool: `searchPhotos`
Finds photos for specific people, dates, locations, or event names.
```json
{
  "name": "searchPhotos",
  "description": "Search the user's photo collection using structured filters.",
  "parameters": {
    "type": "object",
    "properties": {
      "people": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Names of labeled people to filter photos by."
      },
      "fromDate": {
        "type": "string",
        "description": "Start date for filtering photos in ISO format (YYYY-MM-DD)."
      },
      "toDate": {
        "type": "string",
        "description": "End date for filtering photos in ISO format (YYYY-MM-DD)."
      },
      "location": {
        "type": "string",
        "description": "Location name where photos were taken."
      },
      "event": {
        "type": "string",
        "description": "Event description or name associated with photos."
      }
    },
    "additionalProperties": false
  }
}
```

### Tool: `getPeople`
Retrieves all known labeled persons in the user's database.
```json
{
  "name": "getPeople",
  "description": "Return the list of labeled people belonging to the authenticated user.",
  "parameters": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
```

### Tool: `sendEmail`
Sends photos to a recipient via email.
```json
{
  "name": "sendEmail",
  "description": "Send photos via email. If the user refers to 'these photos', 'them', or the most recent search results, photoIds may be omitted and the backend will automatically resolve them using the user's latest photo search.",
  "parameters": {
    "type": "object",
    "properties": {
      "photoIds": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Array of MongoDB photo IDs to email. Omit this parameter if the user refers to previously searched/found photos (e.g. 'these', 'them', 'the photos')."
      },
      "email": {
        "type": "string",
        "format": "email",
        "description": "The recipient's email address."
      },
      "format": {
        "type": "string",
        "enum": ["links", "zip"],
        "description": "Specify the delivery format. Choose 'zip' if the user explicitly requested a ZIP file or compressed archive. Choose 'links' for standard individual links."
      }
    },
    "required": ["email"],
    "additionalProperties": false
  }
}
```

### Tool: `sendWhatsApp`
Sends a WhatsApp message containing links or a ZIP to the photos.
```json
{
  "name": "sendWhatsApp",
  "description": "Send photos through WhatsApp. If the user refers to 'these photos', 'them', or the most recent search results, photoIds may be omitted and the backend will automatically resolve them using the user's latest photo search.",
  "parameters": {
    "type": "object",
    "properties": {
      "photoIds": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Array of MongoDB photo IDs to send. Omit this parameter if the user refers to previously searched/found photos (e.g. 'these', 'them', 'the photos')."
      },
      "phoneNumber": {
        "type": "string",
        "description": "The recipient's WhatsApp phone number in international format."
      },
      "format": {
        "type": "string",
        "enum": ["links", "zip"],
        "description": "Specify the delivery format. Choose 'zip' if the user explicitly requested a ZIP file or compressed archive. Choose 'links' for standard individual links."
      }
    },
    "required": ["phoneNumber"],
    "additionalProperties": false
  }
}
```

### Tool: `requestZipConfirmation`
Requests user approval to send a compressed ZIP when direct delivery exceeds platform limits.
```json
{
  "name": "requestZipConfirmation",
  "description": "Ask the frontend whether the user approves ZIP compression when delivery exceeds platform limits.",
  "parameters": {
    "type": "object",
    "properties": {
      "deliveryMethod": {
        "type": "string",
        "enum": ["email", "whatsapp"],
        "description": "The delivery method chosen by the user."
      },
      "estimatedSizeMB": {
        "type": "number",
        "description": "The estimated total size in megabytes of the photos to be sent."
      }
    },
    "required": ["deliveryMethod", "estimatedSizeMB"],
    "additionalProperties": false
  }
}
```

### Tool: `confirmZipDelivery`
Confirms or cancels a pending large photo delivery session using the sessionId.
```json
{
  "name": "confirmZipDelivery",
  "description": "Confirm or cancel a pending large photo delivery session using the sessionId provided.",
  "parameters": {
    "type": "object",
    "properties": {
      "sessionId": {
        "type": "string",
        "description": "The UUID session ID for the pending ZIP confirmation."
      },
      "confirmed": {
        "type": "boolean",
        "description": "True if the user confirms and wants to deliver as a ZIP. False if they reject and want to cancel."
      }
    },
    "required": ["sessionId", "confirmed"],
    "additionalProperties": false
  }
}
```

### Tool: `getDeliveryHistory`
Retrieves the user's photo sharing history.
```json
{
  "name": "getDeliveryHistory",
  "description": "Retrieve the user's photo delivery and sharing history records.",
  "parameters": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "number",
        "description": "The maximum number of recent delivery records to retrieve. Defaults to 10."
      }
    },
    "additionalProperties": false
  }
}
```

---

## 2. Session Memory Layout

Redis maintains conversation context and state maps in a namespaced key: `session:${userId}` with a 24-hour TTL:

```json
{
  "messages": [
    { "role": "user", "content": "Show me Dad's photos" },
    { "role": "assistant", "tool_calls": [ { "id": "call_1", "type": "function", "function": { "name": "searchPhotos", "arguments": "{\"people\":[\"Dad\"]}" } } ] },
    { "role": "tool", "tool_call_id": "call_1", "content": "[{\"id\":\"6a29086f...\",\"date\":\"2023-11-12\",\"people\":[\"Dad\"]}]" },
    { "role": "assistant", "content": "I found 1 photo of Dad." }
  ],
  "memory": {
    "lastPhotoSearch": {
      "people": ["Dad"],
      "fromDate": null,
      "toDate": null,
      "location": null,
      "event": null,
      "query": "people: [Dad]",
      "photoIds": ["6a29086f..."],
      "resultIds": ["6a29086f..."],
      "timestamp": "2026-06-10T15:20:00.000Z"
    },
    "lastDelivery": {
      "method": "email",
      "photoIds": ["6a29086f..."],
      "destination": "mom@example.com",
      "timestamp": "2026-06-10T15:20:05.000Z"
    },
    "pendingZipConfirmation": null
  }
}
```

When a payload exceeds limits, `pendingZipConfirmation` is initialized temporarily in the session context:
```json
"pendingZipConfirmation": {
  "deliveryMethod": "email",
  "estimatedSizeMB": 32.5,
  "pending": true
}
```

---

## 3. Orchestration & Bounded Loop Logic

The agent loop executes inside [agentLoop.js](file:///d:/Drishyamitra/backend/src/agent/agentLoop.js) using the following pipeline:

1. **Session Load**: Reads session from Redis (default defaults initialized if missing).
2. **Context Compacting**: To preserve the LLM context window and prevent token bloating, only the last `10` messages are prepended to the system prompt and sent to Groq.
3. **Dynamic Tool Filtering**: Tools are filtered before each LLM call based on the user's message keywords (e.g. only appending `getDeliveryHistory` when "history" is requested) to optimize prompt size.
4. **Deterministic Heuristics Routing**: Heuristics route queries:
   - Simple conversation maps to `llama-3.1-8b-instant`.
   - Complex queries matching keywords (`send`, `email`, `whatsapp`, `deliver`, etc.) route to `llama-3.3-70b-versatile` for tool-calling precision.
5. **Orchestration Loop**: Runs up to a strict ceiling of `MAX_TOOL_DEPTH = 5` iterations.
6. **Reference Resolution**: If delivery tools are called without `photoIds`, the backend automatically resolves them using `session.memory.lastPhotoSearch.photoIds`.
7. **Pruning & Writing**: Slices message history to `MAX_MESSAGES = 20` and saves back to Redis. Persists the user message, final reply, and a brief session topic summary into MongoDB `chathistories`.

---

## 4. Failure Handling & Resilience Strategies

### A. Fallback Model Routing
If Groq returns a `429 RateLimitError` on the requested model, the agent catches the exception, registers the model as rate-limited, and automatically retries the request using the alternative model (e.g., swapping `70b` with `8b`).

### B. Manual Failed-Generation Parsing
If Groq returns a `400 tool_use_failed` parsing exception (commonly caused by minor API gateway parsing anomalies in function-calling responses), the code intercepts the error, parses the `failed_generation` string manually using raw regex/JSON index boundaries to extract the tool name and arguments, and safely recovers the tool execution loop.

### C. Parameter Coercion and Validation
- All inputs are coerced before execution (e.g. converting a string parameter for `people` to an array).
- Validation failures do not throw HTTP exceptions. If parameters fail validation, a JSON string containing the validation error is returned to the LLM as the tool execution result, allowing the LLM to gracefully explain the issue and request clarification.
