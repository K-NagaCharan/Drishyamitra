import cv2
import urllib.request
import numpy as np
import insightface
from insightface.app import FaceAnalysis

print("Initializing InsightFace analysis...")
app = FaceAnalysis(name="buffalo_l")
app.prepare(ctx_id=-1, det_size=(640, 640))

url = "https://res.cloudinary.com/dxgl7wq2e/image/upload/v1780996807/apes/photos/it9r9ttnr9or2omdm4fk.jpg"
print(f"Downloading test image from: {url}")

try:
    req = urllib.request.urlopen(url)
    arr = np.asarray(bytearray(req.read()), dtype=np.uint8)
    img = cv2.imdecode(arr, -1)
    
    print("Running face detection...")
    faces = app.get(img)
    print(f"Detected {len(faces)} faces.")
    for i, face in enumerate(faces):
        print(f"Face {i+1}:")
        print(f"  BBox: {face.bbox}")
        print(f"  Embedding dimension: {len(face.embedding)}")
        print(f"  First 5 values: {face.embedding[:5]}")
except Exception as e:
    print("Error:", e)
