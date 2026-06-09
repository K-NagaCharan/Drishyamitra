from insightface.app import FaceAnalysis
from config import Config
from utils.image_utils import download_image
import numpy as np

# Initialize FaceAnalysis (Buffalo_L) once
app = FaceAnalysis(name="buffalo_l")
app.prepare(ctx_id=-1, det_size=(640, 640))

def extract_embeddings(img):
    """
    Executes InsightFace represent function to extract face embeddings and bounding boxes.
    
    Args:
        img (numpy.ndarray): OpenCV BGR image array.
        
    Returns:
        list: List of detected face representation dictionaries.
    """
    try:
        faces = app.get(img)
        
        results = []
        for face in faces:
            # bbox is [x_min, y_min, x_max, y_max]
            bbox = face.bbox
            x = int(bbox[0])
            y = int(bbox[1])
            w = int(bbox[2] - bbox[0])
            h = int(bbox[3] - bbox[1])
            
            # Convert embedding numpy array to a list
            embedding = face.embedding.tolist()
            
            results.append({
                "embedding": embedding,
                "facial_area": {
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h
                }
            })
            
        return results
    except Exception as e:
        raise e

def recognize_faces(image_url):
    """
    Downloads image and extracts face embeddings.
    
    Args:
        image_url (str): Image public URL.
        
    Returns:
        list: Normalized list of representation dictionaries.
    """
    img = download_image(image_url)
    return extract_embeddings(img)
