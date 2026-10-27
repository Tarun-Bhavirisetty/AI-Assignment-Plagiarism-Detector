import os
import re
import uuid
import mimetypes
from datetime import datetime, timedelta, timezone
from typing import List, Optional
import hashlib
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query
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
from email_service import (
    generate_verification_token, hash_token, send_verification_email,
    get_smtp_config, validate_smtp_config, verify_smtp_connection
)

router = APIRouter()

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY", "secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Ensure uploads directory exists
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

EMAIL_REGEX = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'

# --- Schemas ---
class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    registration_number: Optional[str] = None
    confirm_password: Optional[str] = None
    department: Optional[str] = "Computer Science"

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user: Optional[dict] = None

class VerifyEmailRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: str

class RoleUpdate(BaseModel):
    role: str
    department: Optional[str] = None

class SectionCreate(BaseModel):
    name: str
    department: Optional[str] = "Computer Science"

class SectionResponse(BaseModel):
    id: int
    name: str
    department: Optional[str] = None

class EvaluatorSectionCreate(BaseModel):
    evaluator_id: int
    section_id: int

class EvaluationSubmit(BaseModel):
    marks: Optional[float] = None
    max_marks: Optional[float] = 100.0
    status: str
    decision: Optional[str] = None
    comments: Optional[str] = None

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
        expire = datetime.utcnow() + timedelta(minutes=60)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Dependency to get current user
from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def normalize_role(role: Optional[str]) -> str:
    if not role or role in ["user", "student"]:
        return "student"
    return role.lower()

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
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email before accessing this service."
        )
    return user

def require_roles(*allowed_roles: str):
    def role_checker(current_user: models.User = Depends(get_current_user)):
        user_role = normalize_role(current_user.role)
        normalized_allowed = [normalize_role(r) for r in allowed_roles]
        if user_role not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: required role in {allowed_roles}"
            )
        return current_user
    return role_checker

def get_admin_user(current_user: models.User = Depends(get_current_user)):
    if normalize_role(current_user.role) != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Admin privileges required"
        )
    return current_user

def get_evaluator_assigned_section_names(evaluator_id: int, db: Session) -> list[str]:
    mappings = db.query(models.EvaluatorSection).filter(models.EvaluatorSection.evaluator_id == evaluator_id).all()
    section_ids = [m.section_id for m in mappings]
    if not section_ids:
        return []
    sections = db.query(models.Section).filter(models.Section.id.in_(section_ids)).all()
    return [s.name for s in sections]

# --- Auth Endpoints ---

RESEND_COOLDOWN_SECONDS = 60
resend_cooldowns: dict[str, datetime] = {}

@router.post("/signup")
def signup(user: UserCreate, db: Session = Depends(get_db)):
    name = (user.name or "").strip()
    email = (user.email or "").strip().lower()
    password = user.password or ""
    confirm_password = (user.confirm_password or "").strip()
    reg_number = (user.registration_number or "").strip().upper()

    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Full Name must be at least 2 characters long")

    if not reg_number:
        raise HTTPException(status_code=400, detail="Registration Number is required")

    if not re.match(r'^[A-Za-z0-9\-_/]+$', reg_number):
        raise HTTPException(status_code=400, detail="Registration Number can only contain letters, numbers, hyphens, and slashes")

    if not email or not re.match(EMAIL_REGEX, email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    if not confirm_password:
        raise HTTPException(status_code=400, detail="Confirm Password is required")

    if user.confirm_password != password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    db_user_email = db.query(models.User).filter(models.User.email == email).first()
    if db_user_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    db_user_reg = db.query(models.User).filter(models.User.registration_number == reg_number).first()
    if db_user_reg:
        raise HTTPException(status_code=400, detail="Registration number already registered")

    raw_token, token_hash, expires_at = generate_verification_token()
    hashed_password = get_password_hash(password)

    new_user = models.User(
        name=name,
        email=email,
        password_hash=hashed_password,
        role="student", # Force student role strictly!
        registration_number=reg_number,
        department=user.department or "Computer Science",
        is_verified=False,
        verification_token=token_hash,
        verification_token_expires=expires_at
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    email_res = send_verification_email(new_user.email, new_user.name, raw_token)
    sent = email_res.get("sent", False)

    return {
        "success": True,
        "message": (
            "Registration successful! A verification link has been sent to your email. Please verify your email to log in."
            if sent else
            f"Registration completed. {email_res.get('message', 'Please check your email.')}"
        ),
        "email": new_user.email,
        "is_verified": False,
        "email_sent": sent,
        "smtp_configured": email_res.get("method") == "smtp" or sent,
        "verification_url": email_res.get("verification_url")
    }

@router.post("/verify-email")
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    if not data.token:
        raise HTTPException(status_code=400, detail="Verification token is required")
    token_hash = hash_token(data.token.strip())
    user = db.query(models.User).filter(models.User.verification_token == token_hash).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or already used verification token")
    if user.verification_token_expires and user.verification_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification token has expired. Please request a new one.")
    
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()
    return {"success": True, "message": "Email verified successfully! You can now log in."}

@router.get("/verify-email")
def verify_email_get(token: str = Query(...), db: Session = Depends(get_db)):
    return verify_email(VerifyEmailRequest(token=token), db)

@router.post("/resend-verification")
def resend_verification(data: ResendVerificationRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    now = datetime.utcnow()
    if email in resend_cooldowns:
        elapsed = (now - resend_cooldowns[email]).total_seconds()
        if elapsed < RESEND_COOLDOWN_SECONDS:
            remaining = int(RESEND_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining} seconds before requesting another verification email."
            )

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return {"success": True, "message": "If this email is registered, a verification link has been sent."}
    if user.is_verified:
        return {"success": True, "message": "Account is already verified. You can log in directly."}
    
    raw_token, token_hash, expires_at = generate_verification_token()
    user.verification_token = token_hash
    user.verification_token_expires = expires_at
    db.commit()

    resend_cooldowns[email] = now
    email_res = send_verification_email(user.email, user.name, raw_token)
    sent = email_res.get("sent", False)
    return {
        "success": True,
        "message": (
            "Verification link has been resent to your email. Please check your inbox."
            if sent else
            f"Verification link generated. {email_res.get('message', 'Please check your email.')}"
        ),
        "email_sent": sent,
        "smtp_configured": email_res.get("method") == "smtp" or sent,
        "verification_url": email_res.get("verification_url")
    }

@router.get("/admin/smtp-status")
def get_smtp_status(current_user: models.User = Depends(get_admin_user)):
    is_valid, validation_msg = validate_smtp_config()
    cfg = get_smtp_config()
    if not is_valid:
        return {
            "configured": False,
            "status": "Incomplete Configuration",
            "message": validation_msg,
            "host": cfg.get("host"),
            "port": cfg.get("port"),
            "username_set": bool(cfg.get("user")),
            "password_set": bool(cfg.get("password")),
            "from_email": cfg.get("from_email"),
            "environment": cfg.get("environment")
        }
    
    conn_ok, conn_msg = verify_smtp_connection()
    return {
        "configured": True,
        "status": "Connected" if conn_ok else "Authentication/Connection Error",
        "message": conn_msg,
        "host": cfg.get("host"),
        "port": cfg.get("port"),
        "username_set": bool(cfg.get("user")),
        "password_set": bool(cfg.get("password")),
        "from_email": cfg.get("from_email"),
        "environment": cfg.get("environment")
    }

@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    email = user.email.strip().lower()
    db_user = db.query(models.User).filter(models.User.email == email).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not db_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please check your inbox or request a new verification link.",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    user_role = normalize_role(db_user.role)
    access_token = create_access_token(
        data={"sub": str(db_user.id), "role": user_role}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user_role,
        "user": {
            "id": db_user.id,
            "name": db_user.name,
            "email": db_user.email,
            "role": user_role,
            "department": db_user.department,
            "registration_number": db_user.registration_number
        }
    }



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
    result = []
    for u in uploads:
        eval_record = db.query(models.Evaluation).filter(models.Evaluation.upload_id == u.id).first()
        result.append({
            "id": u.id,
            "file_name": u.file_name,
            "file_type": u.file_type,
            "section_name": u.section_name or "N/A",
            "assignment_title": u.assignment_title or "N/A",
            "upload_time": u.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if u.upload_time else "",
            "similarity_score": u.similarity_score or 0.0,
            "duplicate_type": u.duplicate_type,
            "evaluation_status": eval_record.status if eval_record else "Pending Review",
            "marks": eval_record.marks if eval_record else None,
            "max_marks": eval_record.max_marks if eval_record else 100.0,
            "decision": eval_record.decision if eval_record else None,
            "comments": eval_record.comments if eval_record else None
        })
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
    name: Optional[str] = None
    email: Optional[str] = None

@router.get("/profile")
def get_profile(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": normalize_role(current_user.role),
        "registration_number": current_user.registration_number,
        "department": current_user.department,
        "is_verified": bool(current_user.is_verified)
    }

@router.put("/update-profile")
def update_profile(data: ProfileUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.name:
        current_user.name = data.name.strip()
    if data.email and data.email != current_user.email:
        clean_email = data.email.strip().lower()
        if not re.match(EMAIL_REGEX, clean_email):
            raise HTTPException(status_code=400, detail="Invalid email format")
        existing = db.query(models.User).filter(models.User.email == clean_email).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="Email already taken")
        current_user.email = clean_email
    db.commit()
    db.refresh(current_user)
    return {
        "success": True, 
        "message": "Profile updated successfully",
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "role": normalize_role(current_user.role),
            "registration_number": current_user.registration_number,
            "department": current_user.department,
            "is_verified": bool(current_user.is_verified)
        }
    }

# --- User & Role Management (Admin / HOD) ---

@router.get("/admin/users")
def get_users_list(current_user: models.User = Depends(require_roles("admin", "hod")), db: Session = Depends(get_db)):
    query = db.query(models.User)
    if normalize_role(current_user.role) == "hod":
        dept = current_user.department or "Computer Science"
        query = query.filter(models.User.department == dept)
    users = query.all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": normalize_role(u.role),
            "registration_number": u.registration_number,
            "department": u.department or "Computer Science",
            "is_verified": bool(u.is_verified)
        }
        for u in users
    ]

@router.put("/admin/users/{user_id}/role")
def update_user_role(user_id: int, data: RoleUpdate, current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    valid_roles = ["student", "evaluator", "hod", "admin"]
    new_role = data.role.lower()
    if new_role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of {valid_roles}")
    
    if user.id == current_user.id and new_role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote your own admin account")

    user.role = new_role
    if data.department:
        user.department = data.department.strip()
    db.commit()
    return {"success": True, "message": f"User role updated to {user.role}", "role": user.role}

# --- Sections Management ---

@router.get("/sections")
def get_sections(db: Session = Depends(get_db)):
    return db.query(models.Section).all()

@router.post("/sections")
def create_section(section: SectionCreate, current_user: models.User = Depends(require_roles("admin", "hod")), db: Session = Depends(get_db)):
    dept = current_user.department if normalize_role(current_user.role) == "hod" else (section.department or "Computer Science")
    existing = db.query(models.Section).filter(models.Section.name == section.name.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Section already exists")
    new_sec = models.Section(name=section.name.strip(), department=dept)
    db.add(new_sec)
    db.commit()
    db.refresh(new_sec)
    return new_sec

@router.delete("/sections/{section_id}")
def delete_section(section_id: int, current_user: models.User = Depends(require_roles("admin", "hod")), db: Session = Depends(get_db)):
    section = db.query(models.Section).filter(models.Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    if normalize_role(current_user.role) == "hod" and section.department != current_user.department:
        raise HTTPException(status_code=403, detail="Cannot delete section outside your department")
    db.delete(section)
    db.commit()
    return {"message": "Section deleted"}

# --- Evaluator-to-Section Assignment Endpoints ---

@router.get("/evaluators")
def get_evaluators(current_user: models.User = Depends(require_roles("admin", "hod")), db: Session = Depends(get_db)):
    query = db.query(models.User).filter(models.User.role.in_(["evaluator", "teacher"]))
    if normalize_role(current_user.role) == "hod":
        dept = current_user.department or "Computer Science"
        query = query.filter(models.User.department == dept)
    evaluators = query.all()
    return [
        {
            "id": e.id,
            "name": e.name,
            "email": e.email,
            "department": e.department or "Computer Science"
        }
        for e in evaluators
    ]

@router.get("/evaluator-sections")
def get_evaluator_sections(current_user: models.User = Depends(require_roles("admin", "hod", "evaluator")), db: Session = Depends(get_db)):
    user_role = normalize_role(current_user.role)
    query = db.query(models.EvaluatorSection)
    
    if user_role == "evaluator":
        query = query.filter(models.EvaluatorSection.evaluator_id == current_user.id)
    elif user_role == "hod":
        dept = current_user.department or "Computer Science"
        section_ids = [s.id for s in db.query(models.Section).filter(models.Section.department == dept).all()]
        query = query.filter(models.EvaluatorSection.section_id.in_(section_ids))
        
    mappings = query.all()
    results = []
    for m in mappings:
        evaluator = db.query(models.User).filter(models.User.id == m.evaluator_id).first()
        section = db.query(models.Section).filter(models.Section.id == m.section_id).first()
        results.append({
            "id": m.id,
            "evaluator_id": m.evaluator_id,
            "evaluator_name": evaluator.name if evaluator else "Unknown",
            "evaluator_email": evaluator.email if evaluator else "",
            "section_id": m.section_id,
            "section_name": section.name if section else "Unknown",
            "department": section.department if section else "General",
            "assigned_at": m.assigned_at.strftime("%d-%m-%Y | %I:%M %p IST") if m.assigned_at else ""
        })
    return results

@router.post("/evaluator-sections")
def assign_evaluator_to_section(data: EvaluatorSectionCreate, current_user: models.User = Depends(require_roles("admin", "hod")), db: Session = Depends(get_db)):
    evaluator = db.query(models.User).filter(models.User.id == data.evaluator_id).first()
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator user not found")
    if normalize_role(evaluator.role) != "evaluator":
        raise HTTPException(status_code=400, detail="Selected user is not an evaluator")
        
    section = db.query(models.Section).filter(models.Section.id == data.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
        
    if normalize_role(current_user.role) == "hod":
        if section.department != current_user.department:
            raise HTTPException(status_code=403, detail="Cannot assign section outside your department")

    existing = db.query(models.EvaluatorSection).filter(
        models.EvaluatorSection.evaluator_id == data.evaluator_id,
        models.EvaluatorSection.section_id == data.section_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Evaluator is already assigned to this section")

    new_mapping = models.EvaluatorSection(
        evaluator_id=data.evaluator_id,
        section_id=data.section_id,
        assigned_by_id=current_user.id
    )
    db.add(new_mapping)
    db.commit()
    db.refresh(new_mapping)
    return {"success": True, "message": f"Assigned {evaluator.name} to section {section.name}"}

@router.delete("/evaluator-sections/{evaluator_id}/{section_id}")
def remove_evaluator_section(evaluator_id: int, section_id: int, current_user: models.User = Depends(require_roles("admin", "hod")), db: Session = Depends(get_db)):
    mapping = db.query(models.EvaluatorSection).filter(
        models.EvaluatorSection.evaluator_id == evaluator_id,
        models.EvaluatorSection.section_id == section_id
    ).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(mapping)
    db.commit()
    return {"success": True, "message": "Assignment removed successfully"}

@router.get("/evaluator/sections")
def get_evaluator_own_sections(current_user: models.User = Depends(require_roles("evaluator", "admin")), db: Session = Depends(get_db)):
    user_role = normalize_role(current_user.role)
    if user_role == "admin":
        return db.query(models.Section).all()
    assigned_section_names = get_evaluator_assigned_section_names(current_user.id, db)
    return db.query(models.Section).filter(models.Section.name.in_(assigned_section_names)).all()

@router.get("/evaluator/submissions")
def get_evaluator_submissions(current_user: models.User = Depends(require_roles("evaluator", "admin")), db: Session = Depends(get_db)):
    user_role = normalize_role(current_user.role)
    if user_role == "admin":
        uploads = db.query(models.Upload).order_by(models.Upload.upload_time.desc()).all()
    else:
        assigned_section_names = get_evaluator_assigned_section_names(current_user.id, db)
        if not assigned_section_names:
            return []
        uploads = db.query(models.Upload).filter(models.Upload.section_name.in_(assigned_section_names)).order_by(models.Upload.upload_time.desc()).all()
    
    results = []
    for u in uploads:
        eval_record = db.query(models.Evaluation).filter(models.Evaluation.upload_id == u.id).first()
        results.append({
            "id": u.id,
            "file_name": u.file_name,
            "student_name": u.owner.name if u.owner else "Unknown",
            "student_email": u.owner.email if u.owner else "",
            "registration_number": u.owner.registration_number if u.owner else "N/A",
            "section_name": u.section_name or "N/A",
            "assignment_title": u.assignment_title or "N/A",
            "upload_time": u.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if u.upload_time else "",
            "similarity_score": u.similarity_score or 0.0,
            "duplicate_type": u.duplicate_type,
            "evaluation_status": eval_record.status if eval_record else "Ready for Review",
            "marks": eval_record.marks if eval_record else None,
            "max_marks": eval_record.max_marks if eval_record else 100.0,
            "decision": eval_record.decision if eval_record else None,
            "comments": eval_record.comments if eval_record else None
        })
    return results

# --- HOD Department & Section Analytics ---

@router.get("/hod/analytics")
def get_hod_analytics(current_user: models.User = Depends(require_roles("hod", "admin")), db: Session = Depends(get_db)):
    dept = current_user.department or "Computer Science"
    user_role = normalize_role(current_user.role)
    
    if user_role == "admin":
        sections = db.query(models.Section).all()
        students_query = db.query(models.User).filter(models.User.role.in_(["student", "user"]))
        evaluators_query = db.query(models.User).filter(models.User.role.in_(["evaluator", "teacher"]))
    else:
        sections = db.query(models.Section).filter(models.Section.department == dept).all()
        students_query = db.query(models.User).filter(models.User.role.in_(["student", "user"]), models.User.department == dept)
        evaluators_query = db.query(models.User).filter(models.User.role.in_(["evaluator", "teacher"]), models.User.department == dept)
    
    total_students = students_query.count()
    total_evaluators = evaluators_query.count()
    section_names = [s.name for s in sections]
    
    if user_role == "admin":
        uploads = db.query(models.Upload).all()
    else:
        uploads = db.query(models.Upload).filter(models.Upload.section_name.in_(section_names)).all() if section_names else []
        
    total_submissions = len(uploads)
    high_similarity_count = sum(1 for u in uploads if (u.similarity_score or 0.0) >= 90.0)
    scores = [u.similarity_score for u in uploads if u.similarity_score is not None]
    avg_similarity = round(sum(scores) / len(scores), 1) if scores else 0.0
    
    upload_ids = [u.id for u in uploads]
    evaluations = db.query(models.Evaluation).filter(models.Evaluation.upload_id.in_(upload_ids)).all() if upload_ids else []
    completed_evals = sum(1 for e in evaluations if e.status == "Evaluation Completed")
    pending_evals = total_submissions - completed_evals
    
    section_stats = []
    for s in sections:
        sec_uploads = [u for u in uploads if u.section_name == s.name]
        sec_upload_ids = [u.id for u in sec_uploads]
        sec_evals = [e for e in evaluations if e.upload_id in sec_upload_ids]
        sec_completed = sum(1 for e in sec_evals if e.status == "Evaluation Completed")
        sec_scores = [u.similarity_score for u in sec_uploads if u.similarity_score is not None]
        sec_avg_sim = round(sum(sec_scores) / len(sec_scores), 1) if sec_scores else 0.0
        
        section_stats.append({
            "section_id": s.id,
            "section_name": s.name,
            "department": s.department,
            "total_submissions": len(sec_uploads),
            "completed_evaluations": sec_completed,
            "pending_evaluations": len(sec_uploads) - sec_completed,
            "average_similarity": sec_avg_sim
        })
        
    evaluators = evaluators_query.all()
    evaluator_workload = []
    for ev in evaluators:
        assigned_sec_names = get_evaluator_assigned_section_names(ev.id, db)
        assigned_uploads = [u for u in uploads if u.section_name in assigned_sec_names]
        assigned_upload_ids = [u.id for u in assigned_uploads]
        ev_evals = [e for e in evaluations if e.upload_id in assigned_upload_ids and e.evaluator_id == ev.id and e.status == "Evaluation Completed"]
        
        evaluator_workload.append({
            "evaluator_id": ev.id,
            "evaluator_name": ev.name,
            "evaluator_email": ev.email,
            "assigned_sections": assigned_sec_names,
            "total_submissions": len(assigned_uploads),
            "completed": len(ev_evals),
            "pending": len(assigned_uploads) - len(ev_evals)
        })

    return {
        "department": dept,
        "total_students": total_students,
        "total_evaluators": total_evaluators,
        "total_sections": len(sections),
        "total_submissions": total_submissions,
        "completed_evaluations": completed_evals,
        "pending_evaluations": pending_evals,
        "average_similarity": avg_similarity,
        "high_similarity_count": high_similarity_count,
        "section_stats": section_stats,
        "evaluator_workload": evaluator_workload
    }

@router.get("/hod/submissions")
def get_hod_submissions(current_user: models.User = Depends(require_roles("hod", "admin")), db: Session = Depends(get_db)):
    dept = current_user.department or "Computer Science"
    user_role = normalize_role(current_user.role)
    
    if user_role == "admin":
        uploads = db.query(models.Upload).order_by(models.Upload.upload_time.desc()).all()
    else:
        sections = db.query(models.Section).filter(models.Section.department == dept).all()
        section_names = [s.name for s in sections]
        uploads = db.query(models.Upload).filter(models.Upload.section_name.in_(section_names)).order_by(models.Upload.upload_time.desc()).all() if section_names else []

    results = []
    for u in uploads:
        eval_record = db.query(models.Evaluation).filter(models.Evaluation.upload_id == u.id).first()
        results.append({
            "id": u.id,
            "file_name": u.file_name,
            "student_name": u.owner.name if u.owner else "Unknown",
            "student_email": u.owner.email if u.owner else "",
            "registration_number": u.owner.registration_number if u.owner else "N/A",
            "section_name": u.section_name or "N/A",
            "assignment_title": u.assignment_title or "N/A",
            "upload_time": u.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if u.upload_time else "",
            "similarity_score": u.similarity_score or 0.0,
            "duplicate_type": u.duplicate_type,
            "evaluation_status": eval_record.status if eval_record else "Ready for Review",
            "marks": eval_record.marks if eval_record else None,
            "decision": eval_record.decision if eval_record else None
        })
    return results

# --- Academic Evaluation Workflow Endpoints ---

@router.get("/evaluations/{upload_id}")
def get_evaluation(upload_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
        
    user_role = normalize_role(current_user.role)
    if user_role == "student" and upload.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    elif user_role == "evaluator":
        assigned = get_evaluator_assigned_section_names(current_user.id, db)
        if upload.section_name not in assigned:
            raise HTTPException(status_code=403, detail="Access denied: upload not in your assigned sections")
            
    eval_record = db.query(models.Evaluation).filter(models.Evaluation.upload_id == upload_id).first()
    if not eval_record:
        return {
            "upload_id": upload_id,
            "status": "Ready for Review",
            "marks": None,
            "max_marks": 100.0,
            "decision": None,
            "comments": None,
            "evaluator_name": None,
            "updated_at": None
        }
        
    evaluator = db.query(models.User).filter(models.User.id == eval_record.evaluator_id).first() if eval_record.evaluator_id else None
    return {
        "upload_id": upload_id,
        "status": eval_record.status,
        "marks": eval_record.marks,
        "max_marks": eval_record.max_marks,
        "decision": eval_record.decision,
        "comments": eval_record.comments,
        "evaluator_name": evaluator.name if evaluator else "Staff Evaluator",
        "updated_at": eval_record.updated_at.strftime("%d-%m-%Y | %I:%M %p IST") if eval_record.updated_at else ""
    }

@router.post("/evaluations/{upload_id}")
def submit_evaluation(upload_id: int, data: EvaluationSubmit, current_user: models.User = Depends(require_roles("evaluator", "hod", "admin")), db: Session = Depends(get_db)):
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
        
    user_role = normalize_role(current_user.role)
    if user_role == "evaluator":
        assigned = get_evaluator_assigned_section_names(current_user.id, db)
        if upload.section_name not in assigned:
            raise HTTPException(status_code=403, detail="Access denied: upload not in your assigned sections")
    elif user_role == "hod":
        sec = db.query(models.Section).filter(models.Section.name == upload.section_name).first()
        if sec and sec.department and current_user.department and sec.department != current_user.department:
            raise HTTPException(status_code=403, detail="Access denied: upload outside your department")

    if data.marks is not None:
        max_m = data.max_marks if data.max_marks is not None else 100.0
        if data.marks < 0 or data.marks > max_m:
            raise HTTPException(status_code=400, detail=f"Marks must be between 0 and {max_m}")

    eval_record = db.query(models.Evaluation).filter(models.Evaluation.upload_id == upload_id).first()
    if not eval_record:
        eval_record = models.Evaluation(
            upload_id=upload_id,
            evaluator_id=current_user.id,
            marks=data.marks,
            max_marks=data.max_marks or 100.0,
            status=data.status,
            decision=data.decision,
            comments=data.comments
        )
        db.add(eval_record)
    else:
        eval_record.evaluator_id = current_user.id
        if data.marks is not None:
            eval_record.marks = data.marks
        if data.max_marks is not None:
            eval_record.max_marks = data.max_marks
        eval_record.status = data.status
        eval_record.decision = data.decision
        eval_record.comments = data.comments
        eval_record.updated_at = datetime.now(timezone(timedelta(hours=5, minutes=30)))
        
    db.commit()
    db.refresh(eval_record)
    return {
        "success": True,
        "message": "Evaluation saved successfully",
        "evaluation": {
            "upload_id": upload_id,
            "status": eval_record.status,
            "marks": eval_record.marks,
            "max_marks": eval_record.max_marks,
            "decision": eval_record.decision,
            "comments": eval_record.comments
        }
    }

# --- Comparison & Highlights with Scoped Authorization ---

@router.get("/compare/{upload_id}")
def compare_uploads(upload_id: int, current_user: models.User = Depends(require_roles("admin", "hod", "evaluator")), db: Session = Depends(get_db)):
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    user_role = normalize_role(current_user.role)
    if user_role == "evaluator":
        assigned_sections = get_evaluator_assigned_section_names(current_user.id, db)
        if upload.section_name not in assigned_sections:
            raise HTTPException(status_code=403, detail="Access denied: upload does not belong to your assigned sections")
    elif user_role == "hod":
        sec = db.query(models.Section).filter(models.Section.name == upload.section_name).first()
        if sec and sec.department and current_user.department and sec.department != current_user.department:
            raise HTTPException(status_code=403, detail="Access denied: upload is outside your department")

    # ── Reference document lookup (authoritative order) ──────────────────────────
    matched_upload = None
    
    # 1. Best: use the stored matched_upload_id from metadata
    if upload.metadata_json and upload.metadata_json.get("matched_upload_id"):
        matched_upload_id = int(upload.metadata_json["matched_upload_id"])
        matched_upload = db.query(models.Upload).filter(models.Upload.id == matched_upload_id).first()
    
    # 2. Try exact-hash lookup (catches 100% exact duplicates missed by metadata)
    if not matched_upload and upload.hash:
        matched_upload = (
            db.query(models.Upload)
            .filter(models.Upload.hash == upload.hash, models.Upload.id != upload.id)
            .order_by(models.Upload.id.asc())
            .first()
        )

    # 3. Fall back to matched_student name → same assignment or latest upload
    if not matched_upload and upload.matched_student:
        matched_user = db.query(models.User).filter(models.User.name == upload.matched_student).first()
        if matched_user:
            matched_upload = (
                db.query(models.Upload)
                .filter(
                    models.Upload.user_id == matched_user.id,
                    models.Upload.assignment_title == upload.assignment_title,
                    models.Upload.id != upload.id,
                )
                .first()
            )
            if not matched_upload:
                matched_upload = (
                    db.query(models.Upload)
                    .filter(models.Upload.user_id == matched_user.id, models.Upload.id != upload.id)
                    .order_by(models.Upload.upload_time.desc())
                    .first()
                )
    
    original_text = upload.extracted_text or ""
    upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []

    # Run content comparison when a reference is available
    if matched_upload and matched_upload.extracted_text:
        matched_text = matched_upload.extracted_text

        # is_file_exact: True when binary SHA-256 hashes are identical.
        # Must also check matched_upload.hash, because the upload might be the
        # first/reference upload (sim_score=None) but files are binary-identical.
        hashes_identical = (
            bool(upload.hash)
            and bool(matched_upload.hash)
            and upload.hash == matched_upload.hash
        )
        is_file_exact = hashes_identical or (
            upload.similarity_score is not None and upload.similarity_score >= 99.9
        )

        comparison_data = compare_texts(
            original_text, matched_text, upload_pages,
            is_file_exact=is_file_exact
        )
    else:
        # No reference available - return empty comparison with explicit unavailable state
        comparison_data = {
            "uploaded_highlighted": [],
            "matched_highlighted": [],
            "ai_summary": {"copied": [], "similar": [], "unique": []},
            "page_heatmap": [],
            "breakdown": {},
            "match_statistics": {},
            "overall_similarity": None,
            "detection_method": "unavailable",
        }

    # Single authoritative overall_similarity.
    # Use compare_texts result as truth when comparison ran.
    # This fixes the '0% overall but 100% components' bug for reference/first
    # uploads whose stored sim_score is None (None or 0.0 bug).
    computed_similarity = comparison_data.get("overall_similarity")
    stored_similarity = upload.similarity_score  # may be None for first uploads

    if computed_similarity is not None:
        detection_method = comparison_data.get("detection_method", "")
        if "exact" in (detection_method or ""):
            # Exact content/hash match is definitive: always 100%.
            authoritative_similarity = 100.0
        elif stored_similarity is not None and stored_similarity > computed_similarity + 2:
            # Stored score was validated at upload time; if significantly higher,
            # prefer it to avoid regression for existing records.
            authoritative_similarity = stored_similarity
        else:
            authoritative_similarity = computed_similarity
    else:
        # No comparison ran - use stored score (may still be None for reference uploads).
        authoritative_similarity = stored_similarity

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
            "file_name": matched_upload.file_name if matched_upload else None,
            "matched_student": (
                matched_upload.owner.name
                if matched_upload and matched_upload.owner
                else (upload.matched_student or None)
            ),
            "upload_time": (
                matched_upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST")
                if matched_upload and matched_upload.upload_time else None
            )
        },

        # Single authoritative score. Never collapses None to 0 for reference uploads.
        "overall_similarity": authoritative_similarity,
        "duplicate_type": upload.duplicate_type,
        "detection_method": comparison_data.get("detection_method"),

        "uploaded_highlighted": comparison_data["uploaded_highlighted"],
        "matched_highlighted": comparison_data["matched_highlighted"],
        "ai_summary": comparison_data.get("ai_summary", {}),
        "page_heatmap": comparison_data.get("page_heatmap", []),
        "breakdown": comparison_data.get("breakdown", {}),
        "match_statistics": comparison_data.get("match_statistics", {}),
    }

@router.get("/admin/download/highlighted/{upload_id}")
def download_highlighted_pdf(upload_id: int, type: str = "uploaded", current_user: models.User = Depends(require_roles("admin", "hod", "evaluator")), db: Session = Depends(get_db)):
    import fitz
    from fastapi.responses import Response

    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    user_role = normalize_role(current_user.role)
    if user_role == "evaluator":
        assigned_sections = get_evaluator_assigned_section_names(current_user.id, db)
        if upload.section_name not in assigned_sections:
            raise HTTPException(status_code=403, detail="Access denied: upload does not belong to your assigned sections")
    elif user_role == "hod":
        sec = db.query(models.Section).filter(models.Section.name == upload.section_name).first()
        if sec and sec.department and current_user.department and sec.department != current_user.department:
            raise HTTPException(status_code=403, detail="Access denied: upload is outside your department")

    matched_upload = None
    # 1. Best: use the stored matched_upload_id from metadata
    if upload.metadata_json and upload.metadata_json.get("matched_upload_id"):
        matched_upload_id = int(upload.metadata_json["matched_upload_id"])
        matched_upload = db.query(models.Upload).filter(models.Upload.id == matched_upload_id).first()

    # 2. Exact hash lookup
    if not matched_upload and upload.hash:
        matched_upload = (
            db.query(models.Upload)
            .filter(models.Upload.hash == upload.hash, models.Upload.id != upload.id)
            .order_by(models.Upload.id.asc())
            .first()
        )

    # 3. Fall back to matched_student name
    if not matched_upload and upload.matched_student:
        matched_user = db.query(models.User).filter(models.User.name == upload.matched_student).first()
        if matched_user:
            matched_upload = (
                db.query(models.Upload)
                .filter(
                    models.Upload.user_id == matched_user.id,
                    models.Upload.assignment_title == upload.assignment_title,
                    models.Upload.id != upload.id,
                )
                .first()
            )
            if not matched_upload:
                matched_upload = (
                    db.query(models.Upload)
                    .filter(models.Upload.user_id == matched_user.id, models.Upload.id != upload.id)
                    .order_by(models.Upload.upload_time.desc())
                    .first()
                )

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
                    text_to_search = h["text"].replace('\n', ' ').strip()
                    if len(text_to_search) < 5:
                        continue
                        
                    insts = page.search_for(text_to_search)
                    
                    if not insts and len(text_to_search) > 30:
                        words = text_to_search.split()
                        if len(words) > 6:
                            part1 = " ".join(words[:len(words)//2])
                            part2 = " ".join(words[len(words)//2:])
                            insts.extend(page.search_for(part1))
                            insts.extend(page.search_for(part2))
                            
                    if insts:
                        rects_to_highlight[h["color"]].extend(insts)
            
            for color, rects in rects_to_highlight.items():
                if not rects: continue
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
def get_all_uploads(current_user: models.User = Depends(require_roles("admin", "hod")), db: Session = Depends(get_db)):
    query = db.query(models.Upload, models.User).join(
        models.User, models.Upload.user_id == models.User.id
    )
    if normalize_role(current_user.role) == "hod":
        dept = current_user.department or "Computer Science"
        sections = db.query(models.Section).filter(models.Section.department == dept).all()
        sec_names = [s.name for s in sections]
        query = query.filter(models.Upload.section_name.in_(sec_names))

    uploads_with_users = query.order_by(models.Upload.upload_time.desc()).all()

    results = []
    for upload, user in uploads_with_users:
        results.append({
            "id": upload.id,
            "file_name": upload.file_name,
            "file_type": upload.file_type,
            "uploaded_by_name": user.name,
            "uploaded_by_email": user.email,
            "registration_number": user.registration_number or "N/A",
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
def download_upload(upload_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload or not upload.file_path:
        raise HTTPException(status_code=404, detail="File not found")

    user_role = normalize_role(current_user.role)
    if user_role == "student" and upload.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: cannot download other students' documents")
    elif user_role == "evaluator":
        assigned = get_evaluator_assigned_section_names(current_user.id, db)
        if upload.section_name not in assigned:
            raise HTTPException(status_code=403, detail="Access denied: document not in your assigned sections")
    elif user_role == "hod":
        sec = db.query(models.Section).filter(models.Section.name == upload.section_name).first()
        if sec and sec.department and current_user.department and sec.department != current_user.department:
            raise HTTPException(status_code=403, detail="Access denied: document is outside your department")

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
            
            if not isinstance(upload.metadata_json, dict):
                upload.metadata_json = {}
                
            metadata = dict(upload.metadata_json)
            metadata["extracted_text"] = bool(original_text)
            metadata["pages_text"] = pages_text
            upload.metadata_json = metadata
            
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

