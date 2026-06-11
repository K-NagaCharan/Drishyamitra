import os
from dotenv import load_dotenv

# Load environment variables from a local .env file if it exists
load_dotenv()

class Config:
    """Configuration class for the Face Service microservice."""
    PORT = int(os.getenv("PORT", 5001))
    FACE_MODEL = os.getenv("FACE_MODEL", "Facenet512")
    DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "retinaface")
    DISTANCE_METRIC = os.getenv("DISTANCE_METRIC", "cosine")
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    DETECTION_SIZE = int(os.getenv("DETECTION_SIZE", 1024))
    MIN_DETECTION_SCORE = float(os.getenv("MIN_DETECTION_SCORE", 0.40))
    MIN_FACE_SIZE = int(os.getenv("MIN_FACE_SIZE", 35))
