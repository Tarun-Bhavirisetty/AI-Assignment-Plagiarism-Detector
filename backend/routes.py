import os
import uuid
import mimetypes
from datetime import datetime, timedelta
from typing import List, Optional
import hashlib
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from jose import JWTError, jwt

from database import get_db
import models
from metadata import extract_metadata
from duplicate_detector import get_exact_hash, get_image_phash, calculate_phash_similarity
from ai_engine import generate_text_embedding, search_similar, add_to_chroma
from text_extractor import extract_and_clean
from comparison import compare_texts

router = APIRouter()

# Password hashing

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY", "secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# --- Schemas ---
class UserCreate(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

class SectionCreate(BaseModel):
    name: str

class SectionResponse(BaseModel):
    id: int
    name: str

class AnalyticsResponse(BaseModel):
    total_uploads: int
    duplicate_uploads: int
    file_type_stats: dict
    recent_uploads: list
    duplicate_records: list = []
    section_stats: dict = {}
    assignment_stats: dict = {}
    top_copied_assignments: list = []
    most_flagged_students: list = []
    section_plagiarism_stats: dict = {}
    duplicate_trends: dict = {}

# --- Auth Utilities ---
def get_password_hash(password):
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password, hashed_password):
    return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Dependency to get current user
from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user

def get_admin_user(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    return current_user


# --- Endpoints ---

@router.post("/signup", response_model=Token)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = models.User(name=user.name, email=user.email, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(new_user.id)}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": new_user.role}


@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(db_user.id)}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": db_user.role}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), section_name: str = Form(None), assignment_title: str = Form(None), current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Basic validation
    MAX_SIZE = int(os.getenv("MAX_UPLOAD_SIZE_MB", 50)) * 1024 * 1024
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    # Save file to disk
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    # Check size
    if os.path.getsize(file_path) > MAX_SIZE:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail="File too large")

    # Determine type
    mime_type, _ = mimetypes.guess_type(file_path)
    file_type = mime_type or "application/octet-stream"

    exact_hash = get_exact_hash(file_path)

    try:
        # Extract Metadata
        metadata_json = extract_metadata(file_path, file_type)
        
        # Extract Text
        original_text, cleaned_text, pages_text = "", "", []
        if ext in [".pdf", ".docx", ".txt"] or "text" in file_type:
            original_text, cleaned_text, pages_text, structure = extract_and_clean(file_path, file_type)
            metadata_json["extracted_text"] = bool(original_text)
            metadata_json["pages_text"] = pages_text
            metadata_json["document_structure"] = structure
        
        # 1. Exact Duplicate Check (SHA256)
        # Check globally or per user (let's do globally for overall duplicates)
        exact_match = db.query(models.Upload).filter(models.Upload.hash == exact_hash).first()
        
        similarity_score = 0.0
        is_duplicate = False
        duplicate_type = "Unique File"
        matched_file = None
        matched_file_id = None
        matched_upload_time = None
        matched_student = None
        
        if exact_match:
            is_duplicate = True
            duplicate_type = "Exact Duplicate"
            matched_file = exact_match.file_name
            matched_file_id = exact_match.id
            matched_upload_time = exact_match.upload_time
            matched_student = exact_match.owner.name if exact_match.owner else "Unknown"
            metadata_json["matched_upload_id"] = matched_file_id
            
            # Recalculate true similarity immediately
            matched_text = exact_match.extracted_text if exact_match.extracted_text else ""
            comp = compare_texts(original_text, matched_text, pages_text, is_file_exact=True)
            similarity_score = comp.get("overall_similarity", 100.0)
        else:
            # 2. Similar Content Detection
            if "image" in file_type:
                phash = get_image_phash(file_path)
                metadata_json["phash"] = phash
                # Check for similar images in DB
                all_images = db.query(models.Upload).filter(models.Upload.file_type.like('%image%')).all()
                for img in all_images:
                    if img.metadata_json and img.metadata_json.get("phash"):
                        sim = calculate_phash_similarity(phash, img.metadata_json.get("phash"))
                        if sim > similarity_score:
                            similarity_score = sim
                            matched_file = img.file_name
                            matched_file_id = img.id
                            matched_upload_time = img.upload_time
                            matched_student = img.owner.name if img.owner else "Unknown"
                            
                if similarity_score >= 90: # Arbitrary threshold
                    is_duplicate = True
                    duplicate_type = "Similar Duplicate"
                    if matched_file_id:
                        metadata_json["matched_upload_id"] = matched_file_id
                    
            elif "text" in file_type or ext in [".pdf", ".docx", ".txt"]:
                # Use cleaned text for embedding
                text_content = cleaned_text if cleaned_text else ""
                if not text_content and "text" in file_type:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        text_content = f.read(2000)
                
                if text_content.strip():
                    embedding = generate_text_embedding(text_content[:2000]) # Chroma uses first 2000 chars for overall similarity
                    search_result = search_similar(embedding)
                    if search_result.get("is_similar"):
                        is_duplicate = True
                        duplicate_type = "Similar Duplicate"
                        # For Chroma we only have matched_id (which is filename here)
                        matched_file = search_result.get("matched_id")
                        
                        # Fetch from db to get exact info
                        db_match = db.query(models.Upload).filter(models.Upload.file_name == matched_file).first()
                        if db_match:
                            matched_file_id = db_match.id
                            matched_upload_time = db_match.upload_time
                            matched_student = db_match.owner.name if db_match.owner else "Unknown"
                            metadata_json["matched_upload_id"] = matched_file_id
                            
                            # Run exact rigorous comparison to get the authoritative overall_similarity score
                            matched_text = db_match.extracted_text if db_match.extracted_text else ""
                            comp = compare_texts(original_text, matched_text, pages_text, is_file_exact=False)
                            similarity_score = comp.get("overall_similarity", search_result.get("similarity_score", 0.0))
                        else:
                            similarity_score = search_result.get("similarity_score", 0.0)
                    
                    # Add to Chroma
                    add_to_chroma(unique_filename, embedding, {"file_name": file.filename})
                    
        # Save to database
        new_upload = models.Upload(
            user_id=current_user.id,
            file_name=file.filename,
            file_type=file_type,
            hash=exact_hash,
            file_path=file_path,
            similarity_score=similarity_score if similarity_score > 0 else None,
            metadata_json=metadata_json,
            section_name=section_name,
            assignment_title=assignment_title,
            duplicate_type=duplicate_type if is_duplicate else None,
            matched_student=matched_student,
            extracted_text=original_text,
            cleaned_text=cleaned_text
        )
        db.add(new_upload)
        db.commit()
        db.refresh(new_upload)
        
        return {
            "success": True,
            "message": "File uploaded successfully",
            "upload_id": new_upload.id,
            "file_name": new_upload.file_name,
            "upload_time": new_upload.upload_time,
            "metadata": metadata_json
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        
        # Save failed record
        failed_upload = models.Upload(
            user_id=current_user.id,
            file_name=file.filename,
            file_type=file_type,
            hash=exact_hash,
            file_path=file_path,
            section_name=section_name,
            assignment_title=assignment_title,
            metadata_json={"processing_status": "failed", "error": str(e)}
        )
        db.add(failed_upload)
        db.commit()
        
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={
            "success": False,
            "error_code": "DOCUMENT_PROCESSING_ERROR",
            "message": "Upload failed: Unable to process the document."
        })

@router.get("/uploads")
def get_uploads(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    uploads = db.query(models.Upload).filter(models.Upload.user_id == current_user.id).order_by(models.Upload.upload_time.desc()).all()
    # Format upload_time before sending out
    result = []
    for u in uploads:
        d = u.__dict__
        d['upload_time'] = u.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if u.upload_time else ""
        result.append(d)
    return result

@router.get("/duplicates")
def get_duplicates(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    duplicates = db.query(models.Upload).filter(
        models.Upload.user_id == current_user.id,
        models.Upload.similarity_score >= 90.0
    ).order_by(models.Upload.upload_time.desc()).all()
    return duplicates

@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    # Global analytics for admin
    total = db.query(models.Upload).count()
    
    dupes = db.query(models.Upload).filter(
        models.Upload.similarity_score >= 90.0
    ).count()
    
    types_query = db.query(
        models.Upload.file_type, 
        func.count(models.Upload.id)
    ).group_by(models.Upload.file_type).all()
    
    file_type_stats = {"PDF": 0, "DOCX": 0, "TXT": 0, "Other": 0}
    for ft, count in types_query:
        if not ft:
            file_type_stats["Other"] += count
            continue
            
        ft_lower = ft.lower()
        if "pdf" in ft_lower:
            file_type_stats["PDF"] += count
        elif "word" in ft_lower or "officedocument" in ft_lower or "docx" in ft_lower:
            file_type_stats["DOCX"] += count
        elif "text/plain" in ft_lower or "txt" in ft_lower:
            file_type_stats["TXT"] += count
        else:
            file_type_stats["Other"] += count
            
    # Recent uploads globally
    recent = db.query(models.Upload).order_by(models.Upload.upload_time.desc()).limit(10).all()
    
    # Detailed duplicate records for admin
    duplicate_records = []
    # Join with User to get emails
    dupes_with_users = db.query(models.Upload, models.User).join(
        models.User, models.Upload.user_id == models.User.id
    ).filter(
        models.Upload.similarity_score >= 90.0
    ).order_by(models.Upload.upload_time.desc()).limit(20).all()
    
    for upload, user in dupes_with_users:
        # Determine duplicate type
        dup_type = "Exact Duplicate" if upload.similarity_score == 100.0 else "Similar Duplicate"
        
        # We need to find who they matched with. For exact duplicates:
        matched_user_email = "Unknown"
        if upload.similarity_score == 100.0:
            original = db.query(models.Upload, models.User).join(
                models.User, models.Upload.user_id == models.User.id
            ).filter(
                models.Upload.hash == upload.hash, 
                models.Upload.id < upload.id
            ).first()
            if original:
                matched_user_email = original[1].email
        
        duplicate_records.append({
            "id": upload.id,
            "uploaded_by": user.email,
            "uploaded_by_name": user.name,
            "matched_with": upload.matched_student or matched_user_email,
            "file_name": upload.file_name,
            "similarity_score": upload.similarity_score,
            "duplicate_type": upload.duplicate_type or dup_type,
            "upload_time": upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if upload.upload_time else "",
            "section_name": upload.section_name,
            "assignment_title": upload.assignment_title
        })

    # Section-wise and Assignment-wise stats
    section_stats = {}
    assignment_stats = {}
    top_copied_assignments_dict = {}
    most_flagged_students_dict = {}
    section_plagiarism_sum = {}
    section_plagiarism_count = {}
    duplicate_trends = {}

    all_uploads_with_users = db.query(models.Upload, models.User).join(models.User).all()
    for u, user in all_uploads_with_users:
        s = u.section_name or "Unknown"
        a = u.assignment_title or "Unknown"
        section_stats[s] = section_stats.get(s, 0) + 1
        assignment_stats[a] = assignment_stats.get(a, 0) + 1
        
        sim = u.similarity_score or 0
        section_plagiarism_sum[s] = section_plagiarism_sum.get(s, 0) + sim
        section_plagiarism_count[s] = section_plagiarism_count.get(s, 0) + 1
        
        if sim >= 60.0:
            top_copied_assignments_dict[a] = top_copied_assignments_dict.get(a, 0) + 1
            most_flagged_students_dict[user.name] = most_flagged_students_dict.get(user.name, 0) + 1
            
            if u.upload_time:
                date_str = u.upload_time.strftime("%Y-%m-%d")
                duplicate_trends[date_str] = duplicate_trends.get(date_str, 0) + 1

    section_plagiarism_stats = {s: round(section_plagiarism_sum[s] / section_plagiarism_count[s], 1) for s in section_plagiarism_sum}
    
    # Sort dictionaries
    top_copied_assignments = sorted([{"name": k, "count": v} for k, v in top_copied_assignments_dict.items()], key=lambda x: x["count"], reverse=True)[:5]
    most_flagged_students = sorted([{"name": k, "count": v} for k, v in most_flagged_students_dict.items()], key=lambda x: x["count"], reverse=True)[:5]

    return AnalyticsResponse(
        total_uploads=total,
        duplicate_uploads=dupes,
        file_type_stats=file_type_stats,
        recent_uploads=[{"id": r.id, "file_name": r.file_name, "upload_time": r.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if r.upload_time else "", "is_duplicate": (r.similarity_score or 0) >= 90.0} for r in recent],
        duplicate_records=duplicate_records,
        section_stats=section_stats,
        assignment_stats=assignment_stats,
        top_copied_assignments=top_copied_assignments,
        most_flagged_students=most_flagged_students,
        section_plagiarism_stats=section_plagiarism_stats,
        duplicate_trends=duplicate_trends
    )

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

@router.post("/change-password")
def change_password(data: PasswordChange, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password updated successfully"}

class ProfileUpdate(BaseModel):
    email: str

@router.put("/update-profile")
def update_profile(data: ProfileUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.email != current_user.email:
        existing = db.query(models.User).filter(models.User.email == data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already taken")
        current_user.email = data.email
        db.commit()
    return {"message": "Profile updated successfully"}

# --- New Endpoints for Sections and Comparison ---

@router.get("/sections")
def get_sections(db: Session = Depends(get_db)):
    return db.query(models.Section).all()

@router.post("/sections")
def create_section(section: SectionCreate, current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    existing = db.query(models.Section).filter(models.Section.name == section.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Section already exists")
    new_sec = models.Section(name=section.name)
    db.add(new_sec)
    db.commit()
    db.refresh(new_sec)
    return new_sec

@router.delete("/sections/{section_id}")
def delete_section(section_id: int, current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    section = db.query(models.Section).filter(models.Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    db.delete(section)
    db.commit()
    return {"message": "Section deleted"}

@router.get("/compare/{upload_id}")
def compare_uploads(upload_id: int, current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    # Attempt to find the matched upload's content
    matched_upload = None
    
    if upload.metadata_json and upload.metadata_json.get("matched_upload_id"):
        matched_upload_id = upload.metadata_json.get("matched_upload_id")
        matched_upload = db.query(models.Upload).filter(models.Upload.id == matched_upload_id).first()
        
    if not matched_upload and upload.matched_student:
        matched_user = db.query(models.User).filter(models.User.name == upload.matched_student).first()
        if matched_user:
            matched_upload = db.query(models.Upload).filter(
                models.Upload.user_id == matched_user.id,
                models.Upload.assignment_title == upload.assignment_title
            ).first()
            if not matched_upload:
                matched_upload = db.query(models.Upload).filter(models.Upload.user_id == matched_user.id).order_by(models.Upload.upload_time.desc()).first()
    
    if not matched_upload and upload.similarity_score == 100.0:
        matched_upload = db.query(models.Upload).filter(models.Upload.hash == upload.hash, models.Upload.id < upload.id).first()
        
    original_text = upload.extracted_text or "No text content extracted for this assignment."
    matched_text = matched_upload.extracted_text if matched_upload and matched_upload.extracted_text else "Matched assignment content is not available or is an image."
    
    upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []
    
    comparison_data = compare_texts(original_text, matched_text, upload_pages, is_file_exact=(upload.similarity_score == 100.0))
    overall_similarity = comparison_data.get("overall_similarity", upload.similarity_score)
    
    return {
        "upload_id": upload.id,
        "reference_upload_id": matched_upload.id if matched_upload else None,
        
        "uploaded_document": {
            "id": upload.id,
            "file_name": upload.file_name,
            "section_name": upload.section_name,
            "assignment_title": upload.assignment_title,
            "upload_time": upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if upload.upload_time else "Unknown"
        },
        
        "reference_document": {
            "id": matched_upload.id if matched_upload else None,
            "file_name": matched_upload.file_name if matched_upload else "Unknown Reference",
            "matched_student": matched_upload.owner.name if matched_upload and matched_upload.owner else (upload.matched_student or "Unknown"),
            "upload_time": matched_upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if matched_upload and matched_upload.upload_time else "Unknown"
        },
        
        "overall_similarity": overall_similarity,
        "duplicate_type": upload.duplicate_type,
        
        "uploaded_highlighted": comparison_data["uploaded_highlighted"],
        "matched_highlighted": comparison_data["matched_highlighted"],
        "ai_summary": comparison_data.get("ai_summary", {}),
        "page_heatmap": comparison_data.get("page_heatmap", []),
        "breakdown": comparison_data.get("breakdown", {}),
        "match_statistics": comparison_data.get("match_statistics", {})
    }

@router.get("/admin/download/highlighted/{upload_id}")
def download_highlighted_pdf(upload_id: int, type: str = "uploaded", current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    import fitz
    from fastapi.responses import Response

    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    matched_upload = None
    if upload.metadata_json and upload.metadata_json.get("matched_upload_id"):
        matched_upload_id = upload.metadata_json.get("matched_upload_id")
        matched_upload = db.query(models.Upload).filter(models.Upload.id == matched_upload_id).first()
        
    if not matched_upload and upload.matched_student:
        matched_user = db.query(models.User).filter(models.User.name == upload.matched_student).first()
        if matched_user:
            matched_upload = db.query(models.Upload).filter(
                models.Upload.user_id == matched_user.id,
                models.Upload.assignment_title == upload.assignment_title
            ).first()
            if not matched_upload:
                matched_upload = db.query(models.Upload).filter(models.Upload.user_id == matched_user.id).order_by(models.Upload.upload_time.desc()).first()
    
    if not matched_upload and upload.similarity_score == 100.0:
        matched_upload = db.query(models.Upload).filter(models.Upload.hash == upload.hash, models.Upload.id < upload.id).first()

    target_upload = upload if type == "uploaded" else matched_upload
    if not target_upload or not target_upload.file_path or not target_upload.file_path.endswith(".pdf"):
        raise HTTPException(status_code=404, detail="Target document not found or not a PDF")

    original_text = upload.extracted_text or ""
    matched_text = matched_upload.extracted_text if matched_upload else ""
    upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []
    
    comparison_data = compare_texts(original_text, matched_text, upload_pages, is_file_exact=(upload.similarity_score == 100.0))
    highlights = comparison_data["uploaded_highlighted"] if type == "uploaded" else comparison_data["matched_highlighted"]

    try:
        doc = fitz.open(target_upload.file_path)
        for page in doc:
            rects_to_highlight = {"red": [], "yellow": [], "orange": []}
            
            for h in highlights:
                if h["color"] in ["red", "yellow", "orange"]:
                    # Search text handling newlines and spaces loosely
                    text_to_search = h["text"].replace('\n', ' ').strip()
                    if len(text_to_search) < 5:
                        continue # too short to highlight safely
                        
                    insts = page.search_for(text_to_search)
                    
                    # Fallback for line breaks
                    if not insts and len(text_to_search) > 30:
                        words = text_to_search.split()
                        if len(words) > 6:
                            part1 = " ".join(words[:len(words)//2])
                            part2 = " ".join(words[len(words)//2:])
                            insts.extend(page.search_for(part1))
                            insts.extend(page.search_for(part2))
                            
                    if insts:
                        rects_to_highlight[h["color"]].extend(insts)
            
            # Apply merged highlights
            for color, rects in rects_to_highlight.items():
                if not rects: continue
                # In PyMuPDF, add_highlight_annot takes a list of quads/rects and merges them implicitly
                annot = page.add_highlight_annot(rects)
                if annot:
                    if color == "red":
                        annot.set_colors(stroke=(1, 0.4, 0.4))
                    elif color == "yellow":
                        annot.set_colors(stroke=(1, 0.8, 0.4))
                    elif color == "orange":
                        annot.set_colors(stroke=(1, 0.6, 0.2))
                    annot.update()
                        
        pdf_bytes = doc.write()
        doc.close()
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename=highlighted_{target_upload.file_name}"}
        )
    except Exception as e:
        print("PDF Highlight error", e)
        raise HTTPException(status_code=500, detail=f"Failed to highlight PDF: {e}")

@router.get("/admin/uploads")
def get_all_uploads(current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    uploads_with_users = db.query(models.Upload, models.User).join(
        models.User, models.Upload.user_id == models.User.id
    ).order_by(models.Upload.upload_time.desc()).all()

    results = []
    for upload, user in uploads_with_users:
        results.append({
            "id": upload.id,
            "file_name": upload.file_name,
            "file_type": upload.file_type,
            "uploaded_by_name": user.name,
            "uploaded_by_email": user.email,
            "upload_time": upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if upload.upload_time else "",
            "section_name": upload.section_name or "No Section",
            "assignment_title": upload.assignment_title or "No Title",
            "similarity_score": upload.similarity_score or 0.0,
            "duplicate_type": upload.duplicate_type,
            "extracted_text": upload.extracted_text,
            "is_duplicate": (upload.similarity_score or 0) >= 90.0
        })
    return results

from fastapi.responses import FileResponse

@router.get("/admin/download/{upload_id}")
def download_upload(upload_id: int, current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload or not upload.file_path:
        raise HTTPException(status_code=404, detail="File not found")
        
    if not os.path.exists(upload.file_path):
        raise HTTPException(status_code=404, detail="Original file missing from disk")
        
    return FileResponse(upload.file_path, filename=upload.file_name, media_type=upload.file_type)

@router.post("/admin/reprocess_uploads")
def reprocess_uploads(current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    all_uploads = db.query(models.Upload).all()
    processed_count = 0
    
    for upload in all_uploads:
        if not upload.file_path or not os.path.exists(upload.file_path):
            continue
            
        ext = os.path.splitext(upload.file_path)[1]
        
        if ext in [".pdf", ".docx", ".txt"] or "text" in upload.file_type:
            original_text, cleaned_text, pages_text, structure = extract_and_clean(upload.file_path, upload.file_type)
            upload.extracted_text = original_text
            upload.cleaned_text = cleaned_text
            
            # ensure metadata_json is dict before updating
            if not isinstance(upload.metadata_json, dict):
                upload.metadata_json = {}
                
            metadata = dict(upload.metadata_json)
            metadata["extracted_text"] = bool(original_text)
            metadata["pages_text"] = pages_text
            upload.metadata_json = metadata
            
            # Regenerate embedding
            text_content = cleaned_text if cleaned_text else ""
            if not text_content and "text" in upload.file_type:
                try:
                    with open(upload.file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        text_content = f.read(2000)
                except Exception:
                    pass
                    
            if text_content.strip():
                embedding = generate_text_embedding(text_content[:2000])
                unique_filename = os.path.basename(upload.file_path)
                add_to_chroma(unique_filename, embedding, {"file_name": upload.file_name})
                
        processed_count += 1
        
    db.commit()
    return {"message": f"Successfully reprocessed {processed_count} uploads."}
