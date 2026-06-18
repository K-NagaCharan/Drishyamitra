# Face Recognition Microservice

This is the Python microservice responsible for running face detection and face embedding generation for the Drishyamitra system. It uses [InsightFace](https://github.com/deepinsight/insightface) under the hood with the `buffalo_l` model for face bounding box localization and 512-dimensional embedding extraction, and incorporates an IoU-based Non-Maximum Suppression (NMS) deduplication algorithm (threshold: 0.70) to prevent duplicate face records.

## Project Structure

```
face-service/
│
├── app.py                # Server entry point
├── config.py             # Configuration loader
├── requirements.txt      # Python dependencies
├── README.md             # Setup and developer documentation
├── .env.example          # Environment variables template
├── .gitignore            # Git exclusion rules
├── __init__.py           # Root package identifier
│
├── routes/               # HTTP Controller/Route layers
│   ├── __init__.py
│   ├── health.py         # /health endpoint
│   └── recognize.py      # /recognize endpoint
│
├── services/             # Core business logic helpers
│   ├── __init__.py
│   └── face_service.py   # Face recognition and deduplication algorithms
│
├── models/               # ML weights and model definitions
│   └── __init__.py
│
└── utils/                # Utility scripts
    ├── __init__.py
    └── image_utils.py    # Image download and conversion helpers
```

## Setup Guide

### 1. Create a Python Virtual Environment
We recommend using Python 3.10+ (specifically Python 3.13 is verified). Run the following command inside the `face-service/` directory:

```bash
python -m venv venv
```

### 2. Activate the Virtual Environment
Activate the environment based on your current terminal/shell:

*   **PowerShell (Windows):**
    ```powershell
    .\venv\Scripts\Activate.ps1
    ```
*   **CMD (Windows):**
    ```cmd
    .\venv\Scripts\activate.bat
    ```
*   **Bash/zsh (macOS/Linux):**
    ```bash
    source venv/bin/activate
    ```

### 3. Install Dependencies
Ensure you have the virtual environment activated, then install the required libraries:

```bash
pip install -r requirements.txt
```

### 4. Setup Local Environment Variables
Copy `.env.example` to a new `.env` file:

```bash
cp .env.example .env
```

## Running the Server

To start the local development server, run:

```bash
python app.py
```

Upon boot, the console will print the startup configuration banner:

```
====================================
Face Service Started
Port: 5001
Model: buffalo_l
Detector: buffalo_l
====================================
```

---

## API Endpoints

### 1. Health Status
Check if the microservice is operational and which models are active.

*   **Endpoint:** `GET /health`
*   **Response (200 OK):**
    ```json
    {
      "status": "healthy",
      "service": "face-service",
      "model": "buffalo_l",
      "detector": "buffalo_l"
    }
    ```

### 2. Face Recognition
Process an image URL to locate faces, deduplicate overlapping bounding boxes via IoU NMS, and extract 512-dimensional embeddings.

*   **Endpoint:** `POST /recognize`
*   **Request Body:**
    ```json
    {
      "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1234/apes/photo.jpg"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "faces": [
        {
          "bbox": { "x": 120, "y": 80, "w": 50, "h": 50 },
          "embedding": [0.0123, -0.0456, 0.0890, "...", 0.0021]
        }
      ]
    }
    ```

