import subprocess
import time
import sys
import os
import requests

def run_tests():
    base_url = "http://127.0.0.1:5001"
    
    print("\n=== STARTING VERIFICATION TESTS ===\n", flush=True)

    # 1. Test GET /health
    print("Testing GET /health...", end="", flush=True)
    try:
        r = requests.get(f"{base_url}/health")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get("status") == "healthy", f"Expected healthy, got {data.get('status')}"
        assert data.get("service") == "face-service", f"Expected face-service, got {data.get('service')}"
        assert "model" in data, "Missing 'model' in health response"
        assert "detector" in data, "Missing 'detector' in health response"
        print(" [OK]")
        print(f"   Model: {data.get('model')}, Detector: {data.get('detector')}")
    except Exception as e:
        print(" [FAILED]")
        print(f"Error: {e}")
        return False

    # 2. Test Input Validation (Empty JSON)
    print("Testing input validation: empty JSON...", end="", flush=True)
    try:
        r = requests.post(f"{base_url}/recognize", json={})
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        data = r.json()
        assert data.get("status") == "error", "Expected status to be error"
        assert "required" in data.get("message").lower(), f"Unexpected error msg: {data.get('message')}"
        print(" [OK]")
    except Exception as e:
        print(" [FAILED]")
        print(f"Error: {e}")
        return False

    # 3. Test Input Validation (Empty/Whitespace/Invalid Type URL)
    print("Testing input validation: whitespace URL...", end="", flush=True)
    try:
        r = requests.post(f"{base_url}/recognize", json={"imageUrl": "   "})
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        print(" [OK]")
    except Exception as e:
        print(" [FAILED]")
        print(f"Error: {e}")
        return False

    # 4. Test Network Error (Non-existent Domain)
    print("Testing network error: non-existent domain...", end="", flush=True)
    try:
        r = requests.post(f"{base_url}/recognize", json={"imageUrl": "http://nonexistent-domain-drishyamitra-test-12345.com/face.jpg"})
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        data = r.json()
        assert data.get("status") == "error"
        assert "unable to download" in data.get("message").lower()
        print(" [OK]")
    except Exception as e:
        print(" [FAILED]")
        print(f"Error: {e}")
        return False

    # 5. Test Single Face Image (1000x1000)
    # This URL is a high-quality, stable portrait from Unsplash
    single_face_url = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1000&h=1000&q=80"
    print("Testing single face (1000x1000 Unsplash portrait)...", end="", flush=True)
    try:
        r = requests.post(f"{base_url}/recognize", json={"imageUrl": single_face_url})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        faces = data.get("faces", [])
        assert len(faces) == 1, f"Expected exactly 1 face, found {len(faces)}"
        face = faces[0]
        assert "embedding" in face, "Missing embedding in face output"
        assert len(face["embedding"]) == 512, f"Expected embedding length 512, got {len(face['embedding'])}"
        assert "bbox" in face, "Missing bbox in face output"
        bbox = face["bbox"]
        for key in ["x", "y", "w", "h"]:
            assert key in bbox, f"Missing {key} in bbox"
            assert isinstance(bbox[key], (int, float)), f"bbox {key} should be a number"
        print(" [OK]")
        print(f"   Detected 1 face. BBox: {bbox}")
    except Exception as e:
        print(" [FAILED]")
        print(f"Error: {e}")
        return False

    # 6. Test Image with No Faces
    # This URL is a landscape (mountains) photo containing no human faces
    no_face_url = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&h=600&q=80"
    print("Testing no face (landscape photo)...", end="", flush=True)
    try:
        r = requests.post(f"{base_url}/recognize", json={"imageUrl": no_face_url})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        faces = data.get("faces", [])
        assert len(faces) == 0, f"Expected 0 faces, found {len(faces)}"
        print(" [OK]")
    except Exception as e:
        print(" [FAILED]")
        print(f"Error: {e}")
        return False

    # 7. Test Image with Multiple Faces (3000x3000)
    # This URL is a group portrait of friends at a table with multiple clear faces
    multi_face_url = "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1000&q=80"
    print("Testing multiple faces (Unsplash friends portrait)...", end="", flush=True)
    try:
        r = requests.post(f"{base_url}/recognize", json={"imageUrl": multi_face_url})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        faces = data.get("faces", [])
        assert len(faces) > 1, f"Expected multiple faces, found {len(faces)}"
        print(f" [OK] - Detected {len(faces)} faces.")
        for idx, face in enumerate(faces):
            assert len(face["embedding"]) == 512, f"Embedding {idx} length is not 512"
            print(f"   Face {idx + 1}: BBox {face['bbox']}")
    except Exception as e:
        print(" [FAILED]")
        print(f"Error: {e}")
        return False

    print("\n=== ALL TESTS PASSED SUCCESSFULLY ===\n", flush=True)
    return True

if __name__ == "__main__":
    # Start the Flask microservice locally
    print("Starting face-service process...", flush=True)
    
    # Run the server under the virtual environment's python interpreter
    python_bin = os.path.join("venv", "Scripts", "python.exe") if os.name == "nt" else os.path.join("venv", "bin", "python")
    if not os.path.exists(python_bin):
        python_bin = sys.executable
        
    env = os.environ.copy()
    env["PORT"] = "5001"
    
    server_process = subprocess.Popen(
        [python_bin, "app.py"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    
    # Wait for the service to start up and become healthy
    healthy = False
    print("Waiting for face-service to become healthy...", flush=True)
    for _ in range(15):
        try:
            r = requests.get("http://127.0.0.1:5001/health", timeout=2)
            if r.status_code == 200:
                print("face-service is up and running!", flush=True)
                healthy = True
                break
        except requests.RequestException:
            pass
        time.sleep(1)
        
    success = False
    if healthy:
        try:
            success = run_tests()
        finally:
            print("Terminating face-service...", flush=True)
            server_process.terminate()
            try:
                server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print("Force killing face-service...", flush=True)
                server_process.kill()
    else:
        print("face-service failed to start in time. Output log:")
        if server_process.poll() is not None:
            stdout, _ = server_process.communicate()
            print(stdout)
        server_process.terminate()
        sys.exit(1)
        
    if not success:
        sys.exit(1)
