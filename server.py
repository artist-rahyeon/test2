import os
import shutil
from datetime import datetime
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

import json
import urllib.parse
import firebase_admin
from firebase_admin import credentials, auth
from dotenv import load_dotenv

# 0. Load Environment Variables from .env file
load_dotenv()

# ==========================================
# 1. Firebase Admin SDK Initialization
# ==========================================
# To run this server, you must have 'serviceAccountKey.json' in this directory.
# You can generate this from Firebase Console: Project Settings -> Service Accounts -> Generate new private key.
CREDENTIAL_PATH = "serviceAccountKey.json"

# We use a try-except block so the server can at least start if the file is missing,
# but it will fail when trying to verify tokens.
FIREBASE_INITIALIZED = False
if os.path.exists(CREDENTIAL_PATH):
    try:
        cred = credentials.Certificate(CREDENTIAL_PATH)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        FIREBASE_INITIALIZED = True
        print("✅ Firebase Admin SDK initialized successfully (Auth only).")
    except Exception as e:
        print(f"⚠️ Failed to initialize Firebase: {e}")
else:
    print(f"⚠️ Warning: '{CREDENTIAL_PATH}' not found. Authentication will fail.")

# The ONLY admin email allowed to upload files
ADMIN_EMAIL = "happycloud@kakao.com"  # ** 원장님 이메일로 반드시 변경하세요 **

# ==========================================
# 2. FastAPI Setup
# ==========================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# ==========================================
# 3. Authentication Dependency
# ==========================================
def verify_admin_token(authorization: str = Header(None)):
    """
    Dependency to check the Bearer token from the frontend.
    Verifies it via Firebase and checks if the user's email matches ADMIN_EMAIL.
    """
    if not FIREBASE_INITIALIZED:
        raise HTTPException(status_code=500, detail="Server misconfiguration: Firebase not initialized.")
    
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    
    token = authorization.split("Bearer ")[1]
    
    try:
        # Verify the Firebase Token
        decoded_token = auth.verify_id_token(token)
        user_email = decoded_token.get("email", "")
        
        # Check if the authenticated user is the authorized admin
        if user_email != ADMIN_EMAIL:
            raise HTTPException(status_code=403, detail="Forbidden: You are not the authorized administrator.")
        
        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Authentication Token: {e}")

# ==========================================
# 4. API Endpoints
# ==========================================
METADATA_FILE = "uploads_metadata.json"

def load_metadata() -> Dict[str, Any]:
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_metadata(data: Dict[str, Any]) -> None:
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    title: str = Form(...),
    category: str = Form(...),
    admin_token: dict = Depends(verify_admin_token)
):
    """
    Secure upload endpoint. Only accessible if `admin_token` passes verification.
    Uploads file to local disk and saves metadata to JSON file.
    """
    try:
        # 보안: Directory Traversal (경로 조작) 공격 방지
        filename = os.path.basename(file.filename)
        if not filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
            
        file_path = os.path.join(UPLOAD_DIR, filename)

        # Save to local disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_size = os.path.getsize(file_path)
        
        # Save Metadata locally
        meta = load_metadata()
        meta[filename] = {
            "title": title,
            "category": category,
            "filename": filename,
            "originalName": filename,
            "url": f"/uploads/{urllib.parse.quote(filename)}",
            "size_bytes": file_size,
            "timestamp": datetime.now().timestamp(),
            "date_str": datetime.now().strftime("%Y.%m.%d")
        }
        save_metadata(meta)
        
        return {
            "status": "success", 
            "message": "File uploaded successfully to local storage.", 
            "file_url": f"/uploads/{urllib.parse.quote(filename)}", 
            "title": title, 
            "category": category
        }
        
    except Exception as e:
        print("Upload Error:", e)
        raise HTTPException(status_code=500, detail=f"File upload failed: {e}")

@app.get("/api/config")
async def get_client_config():
    """
    Provide Firebase Client Configuration to the frontend securely.
    The actual values should be set in the .env file.
    """
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY", ""),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
        "projectId": os.getenv("FIREBASE_PROJECT_ID", ""),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
        "appId": os.getenv("FIREBASE_APP_ID", ""),
        "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID", "")
    }

@app.get("/api/files")
async def list_files():
    """
    Public endpoint to get list of uploaded files (for board.html).
    """
    try:
        meta = load_metadata()
        files_data = []
        
        # Ensure files still exist on disk
        if os.path.exists(UPLOAD_DIR):
            for filename in os.listdir(UPLOAD_DIR):
                filepath = os.path.join(UPLOAD_DIR, filename)
                if os.path.isfile(filepath) and not filename.startswith('.'):
                    stat = os.stat(filepath)
                    
                    # Get from metadata if available, else derive
                    data = meta.get(filename, {})
                    title = data.get("title", filename)
                    category = data.get("category", "")
                    
                    size_bytes = stat.st_size
                    size_mb = size_bytes / (1024 * 1024)
                    size_str = f"{size_mb:.2f} MB" if size_mb >= 0.1 else f"{int(size_bytes / 1024)} KB"
                    
                    ts = data.get("timestamp", stat.st_mtime)
                    # For newly discovered files, create format string. For existing ones, use saved
                    date_str = data.get("date_str", datetime.fromtimestamp(stat.st_mtime).strftime("%Y.%m.%d"))
                    
                    files_data.append({
                        "id": filename,
                        "title": title,
                        "category": category,
                        "filename": filename,
                        "url": f"/uploads/{urllib.parse.quote(filename)}",
                        "size": size_str,
                        "date": date_str,
                        "timestamp": ts
                    })
        
        # Sort descending by upload time
        files_data.sort(key=lambda x: x['timestamp'], reverse=True)
        return files_data
        
    except Exception as e:
        print("Fetch Error:", e)
        return []

@app.delete("/api/files/{filename}")
async def delete_file(filename: str, admin_token: dict = Depends(verify_admin_token)):
    """
    Secure delete endpoint. Only accessible if `admin_token` passes verification.
    Deletes the file from local disk and removes its metadata from the JSON file.
    """
    try:
        # 보안: Directory Traversal 방지
        safe_filename = os.path.basename(filename)
        if not safe_filename or safe_filename != filename:
            raise HTTPException(status_code=400, detail="Invalid filename format.")

        # 1. 메타데이터에서 제거
        meta = load_metadata()
        if safe_filename in meta:
            meta.pop(safe_filename, None)
            save_metadata(meta)
            
        # 2. 로컬 디스크에서 실제 파일 제거
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            
        return {"status": "success", "message": f"'{safe_filename}' 파일이 성공적으로 삭제되었습니다."}
        
    except Exception as e:
        print("Delete Error:", e)
        raise HTTPException(status_code=500, detail=f"File deletion failed: {e}")

# ==========================================
# 5. Static File Serving (HTML/CSS/JS)
# ==========================================
# Serve uploads directory so files can be downloaded
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve all HTML and assets from the current directory
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    print("🚀 FastAPI Server starting on http://localhost:8000")
    print("🔒 Admin Email Set To:", ADMIN_EMAIL)
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
