from insightface.app import FaceAnalysis
from config import Config
from utils.image_utils import download_image
import numpy as np

# Initialize FaceAnalysis (Buffalo_L) once
app = FaceAnalysis(name="buffalo_l")
app.prepare(ctx_id=-1, det_size=(640, 640))

def compute_iou(box1, box2):
    """
    Computes Intersection over Union (IoU) of two bounding boxes.
    Each box is in [x_min, y_min, x_max, y_max] format.
    """
    x_min1, y_min1, x_max1, y_max1 = box1
    x_min2, y_min2, x_max2, y_max2 = box2
    
    inter_x_min = max(x_min1, x_min2)
    inter_y_min = max(y_min1, y_min2)
    inter_x_max = min(x_max1, x_max2)
    inter_y_max = min(y_max1, y_max2)
    
    if inter_x_max <= inter_x_min or inter_y_max <= inter_y_min:
        return 0.0
        
    inter_area = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min)
    area1 = (x_max1 - x_min1) * (y_max1 - y_min1)
    area2 = (x_max2 - x_min2) * (y_max2 - y_min2)
    
    union_area = area1 + area2 - inter_area
    if union_area == 0:
        return 0.0
        
    return inter_area / union_area

def deduplicate_faces(faces, threshold=0.70):
    """
    Applies Non-Maximum Suppression (NMS) based on IoU threshold to deduplicate detections.
    Detections are sorted by det_score in descending order.
    """
    sorted_faces = sorted(faces, key=lambda f: getattr(f, "det_score", 0.0), reverse=True)
    
    keep = []
    for face in sorted_faces:
        discard = False
        for kept_face in keep:
            iou = compute_iou(face.bbox, kept_face.bbox)
            if iou > threshold:
                discard = True
                break
        if not discard:
            keep.append(face)
    return keep

def extract_embeddings(img):
    """
    Executes InsightFace represent function to extract face embeddings and bounding boxes.
    
    Args:
        img (numpy.ndarray): OpenCV BGR image array.
        
    Returns:
        list: List of detected face representation dictionaries.
    """
    try:
        if img is None or not hasattr(img, "shape"):
            raise ValueError("Input image is invalid or empty")
            
        faces = app.get(img)
        faces = deduplicate_faces(faces, threshold=0.70)
        
        # Get image dimensions for boundary clipping
        img_h, img_w = img.shape[:2]
        
        results = []
        for face in faces:
            # Check for None embedding or invalid bbox
            if face.embedding is None:
                continue
            if face.bbox is None or len(face.bbox) < 4:
                continue
                
            # bbox is [x_min, y_min, x_max, y_max]
            bbox = face.bbox
            x_min = max(0, int(bbox[0]))
            y_min = max(0, int(bbox[1]))
            x_max = min(img_w, int(bbox[2]))
            y_max = min(img_h, int(bbox[3]))
            
            x = x_min
            y = y_min
            w = max(0, x_max - x_min)
            h = max(0, y_max - y_min)
            
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
