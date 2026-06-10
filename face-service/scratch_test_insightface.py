import sys
import numpy as np
import insightface
from insightface.app import FaceAnalysis

try:
    import cv2
except ModuleNotFoundError:
    print("Error: OpenCV (cv2) is not installed in the current Python environment.")
    print("Please ensure you are running this script using the virtual environment's python (e.g., .\\venv\\Scripts\\python.exe).")
    sys.exit(1)

try:
    import requests
except ModuleNotFoundError:
    print("Error: requests is not installed in the current Python environment.")
    print("Please ensure you are running this script using the virtual environment's python (e.g., .\\venv\\Scripts\\python.exe).")
    sys.exit(1)

print("Initializing InsightFace analysis...")
app = FaceAnalysis(name="buffalo_l")
app.prepare(ctx_id=-1, det_size=(640, 640))

url = "https://res.cloudinary.com/dxgl7wq2e/image/upload/v1780996807/apes/photos/it9r9ttnr9or2omdm4fk.jpg"
print(f"Downloading test image from: {url}")

try:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    response = requests.get(url, headers=headers, timeout=20)
    response.raise_for_status()
    arr = np.asarray(bytearray(response.content), dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Failed to decode image data as a valid image")
        
    print("Running face detection...")
    faces = app.get(img)
    print(f"Detected {len(faces)} faces.")
    for i, face in enumerate(faces):
        print(f"Face {i+1}:")
        print(f"  BBox: {face.bbox if face.bbox is not None else 'N/A'}")
        if face.embedding is not None:
            print(f"  Embedding dimension: {len(face.embedding)}")
            print(f"  First 5 values: {face.embedding[:5]}")
        else:
            print("  Embedding: None")
except Exception as e:
    print("Error:", e)
