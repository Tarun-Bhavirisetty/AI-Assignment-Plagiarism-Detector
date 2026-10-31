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
import notification_service



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



    role: Optional[str] = "student"







class UserLogin(BaseModel):



    email: str



    password: str



    role: Optional[str] = None







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



    try:
        user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    except (ValueError, TypeError):
        user = db.query(models.User).filter(models.User.email == str(user_id)).first()



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



    requested_role = (user.role or "student").strip().lower()



    if requested_role in ["admin", "hod", "evaluator"]:



        raise HTTPException(status_code=400, detail="Public registration is only permitted for Student and Faculty roles. Evaluator and HOD/Admin accounts must be assigned by administration.")



    if requested_role not in ["student", "faculty"]:



        requested_role = "student" 







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



        role=requested_role,



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







    user_role = normalize_role(db_user.role)



    # Validate selected role against actual database role if provided

    if user.role:

        selected_role = normalize_role(user.role)

        if selected_role in ["hod", "admin", "hod_admin"]:

            if user_role not in ["hod", "admin"]:

                raise HTTPException(

                    status_code=status.HTTP_401_UNAUTHORIZED,

                    detail=f"Access denied: Account '{email}' is registered as '{user_role.capitalize()}', not HOD/Admin. Please select your assigned role.",

                    headers={"WWW-Authenticate": "Bearer"},

                )

        elif selected_role != user_role:

            raise HTTPException(

                status_code=status.HTTP_401_UNAUTHORIZED,

                detail=f"Access denied: Account '{email}' is registered as '{user_role.capitalize()}', not '{user.role.capitalize()}'. Please select your assigned role.",

                headers={"WWW-Authenticate": "Bearer"},

            )



    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)



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



async def upload_file(file: UploadFile = File(...), section_name: str = Form(None), assignment_title: str = Form(None), assignment_id: Optional[int] = Form(None), current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):



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
    # Assignment-specific checks & deadline enforcement
    is_late_submission = False
    assigned_obj = None
    if assignment_id:
        assigned_obj = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
        if not assigned_obj:
            os.remove(file_path)
            raise HTTPException(status_code=404, detail="Assignment not found")
        if assigned_obj.status in ["Draft", "Archived", "Closed"]:
            os.remove(file_path)
            raise HTTPException(status_code=400, detail=f"Assignment is not currently active for submissions (Status: {assigned_obj.status})")

        now_utc = datetime.now(timezone.utc)
        if assigned_obj.start_date:
            start_dt = assigned_obj.start_date if assigned_obj.start_date.tzinfo else assigned_obj.start_date.replace(tzinfo=timezone.utc)
            if now_utc < start_dt:
                os.remove(file_path)
                raise HTTPException(status_code=400, detail="Assignment submissions are not open yet.")

        if assigned_obj.due_date:
            due_dt = assigned_obj.due_date if assigned_obj.due_date.tzinfo else assigned_obj.due_date.replace(tzinfo=timezone.utc)
            if now_utc > due_dt:
                if not assigned_obj.allow_late_submissions:
                    os.remove(file_path)
                    raise HTTPException(status_code=400, detail="Submission deadline has passed. Late submissions are not accepted.")
                is_late_submission = True

        if assigned_obj.allowed_formats:
            allowed = [fmt.strip().lower() for fmt in assigned_obj.allowed_formats.split(",") if fmt.strip()]
            if ext.lower() not in allowed and not any(file.filename.lower().endswith(fmt) for fmt in allowed):
                os.remove(file_path)
                raise HTTPException(status_code=400, detail=f"File extension {ext} is not allowed. Permitted: {assigned_obj.allowed_formats}")

        max_mb = assigned_obj.max_file_size_mb or 50.0
        if os.path.getsize(file_path) > max_mb * 1024 * 1024:
            os.remove(file_path)
            raise HTTPException(status_code=400, detail=f"File exceeds maximum allowed size of {max_mb} MB")

        if not assignment_title or not assignment_title.strip():
            assignment_title = assigned_obj.title




        



    # Check size



    if os.path.getsize(file_path) > MAX_SIZE:



        os.remove(file_path)



        raise HTTPException(status_code=400, detail="File too large")







    # Determine type



    mime_type, _ = mimetypes.guess_type(file_path)



    file_type = mime_type or "application/octet-stream"







    exact_hash = get_exact_hash(file_path)
    embedding = None







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



        exact_match = db.query(models.Upload).filter(
            models.Upload.hash == exact_hash,
            models.Upload.user_id != current_user.id
        ).order_by(models.Upload.upload_time.asc()).first()



        



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
            metadata_json["reference_upload_id"] = matched_file_id
            metadata_json["reference_upload_timestamp"] = str(exact_match.upload_time) if exact_match.upload_time else ""
            metadata_json["direction"] = f"NEW_SUBMISSION -> REFERENCE_{matched_file_id}"



            



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



                        matched_candidates = search_result.get("all_candidates", [])



                        matched_metadatas = search_result.get("all_metadatas", [])



                        db_match = None







                        for idx, cand_id in enumerate(matched_candidates):



                            cand_meta = matched_metadatas[idx] if idx < len(matched_metadatas) and isinstance(matched_metadatas[idx], dict) else {}



                            # 1. Try stable upload_id from Chroma metadata



                            if cand_meta.get("upload_id"):



                                try:



                                    db_match = db.query(models.Upload).filter(models.Upload.id == int(cand_meta["upload_id"])).first()



                                except Exception:



                                    db_match = None



                            # 2. Try file_path containing candidate ID (UUID)



                            if not db_match and cand_id:



                                db_match = db.query(models.Upload).filter(



                                    models.Upload.file_path.like(f"%{cand_id}%")



                                ).first()



                            # 3. Fallback: try original file_name



                            if not db_match and cand_id:



                                db_match = db.query(models.Upload).filter(



                                    models.Upload.file_name == cand_id



                                ).first()







                            # Avoid self-comparison (peer plagiarism detection only)
                            if db_match and db_match.user_id == current_user.id:
                                db_match = None
                                continue

                            # Validate: candidate must have extracted_text or valid file on disk



                            if db_match and (db_match.extracted_text or (db_match.file_path and os.path.exists(db_match.file_path))):



                                break



                            else:



                                db_match = None







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



                    



                    # Note: add_to_chroma called after db.commit with stable upload_id



                    



        # Save to database



        parent_sub = db.query(models.Upload).filter(
            models.Upload.user_id == current_user.id, 
            models.Upload.assignment_id == assignment_id
        ).order_by(models.Upload.version.desc()).first() if assignment_id else None
        prev_versions = parent_sub.version if parent_sub else 0
        parent_upload_id = parent_sub.id if parent_sub else None

        new_upload = models.Upload(
            user_id=current_user.id,
            assignment_id=assignment_id,
            parent_upload_id=parent_upload_id,
            is_late=is_late_submission,
            version=prev_versions + 1,



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
        # Send submission receipt notification to student
        if assignment_id:
            try:
                sub_title = "Assignment Submitted" if new_upload.version == 1 else f"Revision Submitted (v{new_upload.version})"
                notification_service.create_notification(
                    db=db,
                    user_id=current_user.id,
                    title=sub_title,
                    message=f"Your submission for '{assignment_title or file.filename}' (v{new_upload.version}) was received successfully.",
                    type="submission_received",
                    link="/user-dashboard",
                    send_email_notification=True
                )
            except Exception as e:
                logger.warning(f"Could not send submission notification: {e}")







        # Add to Chroma with stable upload ID in metadata



        if embedding is not None:



            add_to_chroma(unique_filename, embedding, {



                "file_name": file.filename,



                "file_path": file_path,



                "upload_id": new_upload.id,



                "section_name": section_name or "",



                "assignment_title": assignment_title or ""



            })



        



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
        dup_type = "Exact Duplicate" if upload.similarity_score == 100.0 else "Similar Duplicate"
        
        # Resolve historical reference upload
        ref_id = None
        ref_upload = None
        if upload.metadata_json and isinstance(upload.metadata_json, dict):
            ref_id = upload.metadata_json.get("matched_upload_id") or upload.metadata_json.get("reference_upload_id")

        if not ref_id:
            # Find earliest historical exact match uploaded earlier
            orig = db.query(models.Upload).filter(
                models.Upload.hash == upload.hash,
                models.Upload.id < upload.id,
                models.Upload.user_id != upload.user_id
            ).order_by(models.Upload.upload_time.asc()).first()
            if orig:
                ref_id = orig.id
                ref_upload = orig

        if ref_id and not ref_upload:
            try:
                ref_upload = db.query(models.Upload).filter(models.Upload.id == int(ref_id)).first()
            except Exception:
                ref_upload = None

        ref_user = ref_upload.owner if ref_upload else None

        duplicate_records.append({
            "id": upload.id,
            "new_upload_id": upload.id,
            "comparison_id": f"comp_{upload.id}_{ref_id}" if ref_id else f"comp_{upload.id}",
            "comparison_timestamp": upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if upload.upload_time else "",
            "direction": "NEW_SUBMISSION -> EXISTING_REFERENCE",
            
            # Newly uploaded submission (target of evaluation)
            "uploaded_by": user.email,
            "uploaded_by_name": user.name,
            "section_name": upload.section_name or "No Section",
            "assignment_title": upload.assignment_title or upload.file_name,
            "file_name": upload.file_name,
            "similarity_score": upload.similarity_score,
            "duplicate_type": upload.duplicate_type or dup_type,
            "upload_time": upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if upload.upload_time else "",
            
            # Historical reference submission (remains unmodified)
            "reference_upload_id": ref_id,
            "reference_student_name": ref_user.name if ref_user else (upload.matched_student or "Historical Reference"),
            "reference_student_email": ref_user.email if ref_user else "N/A",
            "reference_section_name": ref_upload.section_name if ref_upload else "Unknown Section",
            "reference_assignment_title": ref_upload.assignment_title if ref_upload else "Reference Assignment",
            "reference_file_name": ref_upload.file_name if ref_upload else "reference_doc",
            "reference_upload_time": ref_upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if (ref_upload and ref_upload.upload_time) else "Original Submission",
            "matched_with": ref_user.name if ref_user else (upload.matched_student or "Historical Reference")
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
def get_users_list(
    current_user: models.User = Depends(require_roles("admin", "hod")), 
    db: Session = Depends(get_db)
):
    """
    Roster of users for Administrator and HOD.
    Includes active counts: submissions, created assignments, and evaluations.
    """
    query = db.query(models.User).filter(models.User.is_deleted == False)

    if normalize_role(current_user.role) == "hod":
        dept = current_user.department or "Computer Science"
        query = query.filter(models.User.department == dept)

    users = query.all()

    results = []
    for u in users:
        sub_count = db.query(models.Upload).filter(
            models.Upload.user_id == u.id,
            models.Upload.is_deleted == False
        ).count()
        assign_count = db.query(models.Assignment).filter(models.Assignment.creator_id == u.id).count()
        eval_count = db.query(models.Evaluation).filter(models.Evaluation.evaluator_id == u.id).count()

        results.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": normalize_role(u.role),
            "registration_number": u.registration_number or "—",
            "department": u.department or "Computer Science",
            "section_name": u.section_name or "N/A",
            "is_verified": bool(u.is_verified),
            "is_active": bool(getattr(u, "is_active", True)),
            "submissions_count": sub_count,
            "assignments_created_count": assign_count,
            "evaluations_count": eval_count
        })

    return results



@router.put("/admin/users/{user_id}/role")



def update_user_role(user_id: int, data: RoleUpdate, current_user: models.User = Depends(get_admin_user), db: Session = Depends(get_db)):



    user = db.query(models.User).filter(models.User.id == user_id).first()



    if not user:



        raise HTTPException(status_code=404, detail="User not found")



    valid_roles = ["student", "faculty", "evaluator", "hod", "admin"]



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



    elif user_role in ["hod", "faculty"]:



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



def submit_evaluation(upload_id: int, data: EvaluationSubmit, current_user: models.User = Depends(require_roles("evaluator", "hod", "admin", "faculty")), db: Session = Depends(get_db)):



    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()



    if not upload:



        raise HTTPException(status_code=404, detail="Upload not found")



        



    user_role = normalize_role(current_user.role)



    if user_role == "evaluator":



        assigned = get_evaluator_assigned_section_names(current_user.id, db)



        if upload.section_name not in assigned:



            raise HTTPException(status_code=403, detail="Access denied: upload not in your assigned sections")



    elif user_role in ["hod", "faculty"]:



        sec = db.query(models.Section).filter(models.Section.name == upload.section_name).first()



        assigned_sections = get_evaluator_assigned_section_names(current_user.id, db)



        is_same_dept = not (sec and sec.department and current_user.department and sec.department != current_user.department)



        if not is_same_dept and upload.section_name not in assigned_sections:



            raise HTTPException(status_code=403, detail="Access denied: upload outside your department/assigned sections")



        if user_role == "faculty":



            existing_eval = db.query(models.Evaluation).filter(models.Evaluation.upload_id == upload_id).first()



            if existing_eval and existing_eval.marks is not None and data.marks is not None and data.marks != existing_eval.marks:



                raise HTTPException(status_code=403, detail="Faculty cannot override evaluator marks. You may submit remarks and recommendations in comments.")







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
def compare_uploads(
    upload_id: int, 
    current_user: models.User = Depends(require_roles("admin", "hod", "evaluator", "faculty")), 
    db: Session = Depends(get_db)
):
    """
    Authoritative document comparison endpoint.
    Guarantees:
    1. An upload is NEVER compared against itself.
    2. Only genuine historical predecessors (submitted earlier: id < upload_id) are eligible references.
    3. Forward-in-time comparisons are strictly prohibited.
    4. Clean / Original submissions with no eligible reference return an authoritative Clean result (0.0% similarity).
    5. Exact 100% hash match is ONLY returned when distinct eligible upload records share identical cryptographic SHA-256 hashes.
    """
    upload = db.query(models.Upload).filter(
        models.Upload.id == upload_id,
        models.Upload.is_deleted == False
    ).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found or has been deleted.")

    user_role = normalize_role(current_user.role)
    if user_role == "evaluator":
        assigned_sections = get_evaluator_assigned_section_names(current_user.id, db)
        if upload.section_name not in assigned_sections:
            raise HTTPException(status_code=403, detail="Access denied: upload does not belong to your assigned sections")
    elif user_role in ["hod", "faculty"]:
        sec = db.query(models.Section).filter(models.Section.name == upload.section_name).first()
        assigned_sections = get_evaluator_assigned_section_names(current_user.id, db)
        is_same_dept = not (sec and sec.department and current_user.department and sec.department != current_user.department)
        if not is_same_dept and upload.section_name not in assigned_sections:
            raise HTTPException(status_code=403, detail="Access denied: upload is outside your department/assigned sections")

    # ── Reference document lookup (Strict Directional Predecessor Order) ───────
    matched_upload = None

    # Step 1: Check stored metadata for explicit reference_upload_id or matched_upload_id
    if upload.metadata_json and isinstance(upload.metadata_json, dict):
        cand_id = upload.metadata_json.get("matched_upload_id") or upload.metadata_json.get("reference_upload_id")
        if cand_id:
            try:
                ref_cand = db.query(models.Upload).filter(
                    models.Upload.id == int(cand_id),
                    models.Upload.id < upload.id,
                    models.Upload.user_id != upload.user_id,
                    models.Upload.is_deleted == False
                ).first()
                if ref_cand:
                    matched_upload = ref_cand
            except Exception:
                pass

    # Step 2: If flagged as duplicate at upload time (has similarity_score >= 80 or duplicate_type),
    # but metadata was missing, find the EARLIEST historical upload with identical hash submitted BEFORE this upload
    if not matched_upload and upload.hash and ((upload.similarity_score is not None and upload.similarity_score >= 80.0) or upload.duplicate_type):
        matched_upload = (
            db.query(models.Upload)
            .filter(
                models.Upload.hash == upload.hash,
                models.Upload.id < upload.id,
                models.Upload.user_id != upload.user_id,
                models.Upload.is_deleted == False
            )
            .order_by(models.Upload.upload_time.asc())
            .first()
        )

    # Step 3: If still not resolved and upload was flagged as similar with matched_student
    if not matched_upload and upload.matched_student and (upload.similarity_score is not None and upload.similarity_score >= 80.0):
        matched_user = db.query(models.User).filter(
            models.User.name == upload.matched_student,
            models.User.id != upload.user_id
        ).first()
        if matched_user:
            matched_upload = (
                db.query(models.Upload)
                .filter(
                    models.Upload.user_id == matched_user.id,
                    models.Upload.id < upload.id,
                    models.Upload.is_deleted == False
                )
                .order_by(models.Upload.upload_time.desc())
                .first()
            )

    # ── VERIFY: SELF-COMPARISON AND FORWARD-IN-TIME COMPARISON ARE STRICTLY IMPOSSIBLE ──
    if matched_upload:
        if matched_upload.id >= upload.id or matched_upload.user_id == upload.user_id:
            matched_upload = None

    original_text = upload.extracted_text or ""
    upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []

    # ── IF NO ELIGIBLE REFERENCE EXISTS: RETURN AUTHORITATIVE CLEAN RESULT ──
    if not matched_upload or not matched_upload.extracted_text:
        return {
            "upload_id": upload.id,
            "reference_upload_id": None,
            "comparison_id": f"comp_clean_{upload.id}",
            "direction": "ORIGINAL_SUBMISSION",
            "similarity_status": "Clean",
            "overall_similarity": 0.0,
            "duplicate_type": "Clean",
            "detection_method": "clean_verified",
            "uploaded_document": {
                "id": upload.id,
                "file_name": upload.file_name,
                "section_name": upload.section_name or (upload.owner.section_name if upload.owner else None) or "N/A",
                "assignment_title": upload.assignment_title or (upload.assignment.title if upload.assignment else None) or "N/A",
                "upload_time": format_datetime_ist(upload.upload_time),
                "uploaded_by_name": upload.owner.name if upload.owner else "N/A",
                "uploaded_by_email": upload.owner.email if upload.owner else "N/A",
            },
            "reference_document": None,
            "uploaded_highlighted": [],
            "matched_highlighted": [],
            "ai_summary": {
                "copied": [],
                "similar": [],
                "unique": ["All content in this submission is original. No matching predecessor exists in the repository."],
                "notes": "Verified Clean: Analysis completed. No qualifying duplicate predecessor was detected."
            },
            "page_heatmap": [],
            "breakdown": {
                "exact_match": 0.0,
                "normalized_content": 0.0,
                "lexical_similarity": 0.0,
                "semantic_similarity": 0.0,
                "sentence_similarity": 0.0,
                "paragraph_similarity": 0.0
            },
            "match_statistics": {
                "total_sentences": 0,
                "matched_sentences": 0,
                "total_paragraphs": 0,
                "matched_paragraphs": 0,
                "total_pages": len(upload_pages) if upload_pages else 1,
                "matched_pages": 0
            },
            "evidence_records": []
        }

    # ── GENUINE COMPARISON AGAINST HISTORICAL PREDECESSOR ──
    matched_text = matched_upload.extracted_text
    hashes_identical = (
        bool(upload.hash)
        and bool(matched_upload.hash)
        and upload.hash == matched_upload.hash
        and upload.id != matched_upload.id
    )

    is_file_exact = hashes_identical or (
        upload.similarity_score is not None and upload.similarity_score >= 99.9
    )

    comparison_data = compare_texts(
        original_text, matched_text, upload_pages,
        is_file_exact=is_file_exact
    )

    computed_similarity = comparison_data.get("overall_similarity")
    stored_similarity = upload.similarity_score

    if is_file_exact:
        authoritative_similarity = 100.0
        detection_method = "exact_file_hash" if hashes_identical else "exact_content"
        dup_type = "Exact Duplicate"
        sim_status = "Exact Duplicate"
    elif computed_similarity is not None:
        authoritative_similarity = computed_similarity
        detection_method = comparison_data.get("detection_method", "hybrid_similarity")
        dup_type = "Similar Duplicate" if authoritative_similarity >= 80.0 else "Clean"
        sim_status = "Potential Match" if authoritative_similarity >= 80.0 else "Clean"
    else:
        authoritative_similarity = stored_similarity if stored_similarity is not None else 0.0
        detection_method = "hybrid_similarity"
        dup_type = upload.duplicate_type or "Clean"
        sim_status = "Potential Match" if authoritative_similarity >= 80.0 else "Clean"

    # Persist evidence records if newly detected
    if comparison_data.get("evidence_records"):
        try:
            existing_ev_count = db.query(models.SubmissionEvidence).filter(models.SubmissionEvidence.upload_id == upload.id).count()
            if existing_ev_count == 0:
                for ev in comparison_data["evidence_records"]:
                    ev_row = models.SubmissionEvidence(
                        upload_id=upload.id,
                        reference_upload_id=matched_upload.id,
                        matched_sentence=ev.get("matched_sentence"),
                        reference_sentence=ev.get("reference_sentence"),
                        uploaded_page=ev.get("uploaded_page"),
                        reference_page=ev.get("reference_page"),
                        start_offset=ev.get("start_offset"),
                        end_offset=ev.get("end_offset"),
                        ref_start_offset=ev.get("ref_start_offset"),
                        ref_end_offset=ev.get("ref_end_offset"),
                        sentence_index=ev.get("sentence_index"),
                        paragraph_index=ev.get("paragraph_index"),
                        match_type=ev.get("match_type"),
                        similarity_score=ev.get("score"),
                        color=ev.get("color", "red"),
                        location_status=ev.get("location_status", "mapped")
                    )
                    db.add(ev_row)
                db.commit()
        except Exception:
            db.rollback()

    return {
        "upload_id": upload.id,
        "reference_upload_id": matched_upload.id,
        "comparison_id": f"comp_{upload.id}_{matched_upload.id}",
        "direction": "NEW_SUBMISSION -> EXISTING_REFERENCE",
        "similarity_status": sim_status,
        "overall_similarity": authoritative_similarity,
        "duplicate_type": dup_type,
        "detection_method": detection_method,
        "uploaded_document": {
            "id": upload.id,
            "file_name": upload.file_name,
            "section_name": upload.section_name or (upload.owner.section_name if upload.owner else None) or "N/A",
            "assignment_title": upload.assignment_title or (upload.assignment.title if upload.assignment else None) or "N/A",
            "upload_time": format_datetime_ist(upload.upload_time),
            "uploaded_by_name": upload.owner.name if upload.owner else "N/A",
            "uploaded_by_email": upload.owner.email if upload.owner else "N/A",
        },
        "reference_document": {
            "id": matched_upload.id,
            "file_name": matched_upload.file_name,
            "section_name": matched_upload.section_name or (matched_upload.owner.section_name if matched_upload.owner else None) or "N/A",
            "assignment_title": matched_upload.assignment_title or (matched_upload.assignment.title if matched_upload.assignment else None) or "N/A",
            "matched_student": matched_upload.owner.name if matched_upload.owner else (upload.matched_student or "Historical Reference"),
            "upload_time": format_datetime_ist(matched_upload.upload_time),
        },
        "uploaded_highlighted": comparison_data["uploaded_highlighted"],
        "matched_highlighted": comparison_data["matched_highlighted"],
        "ai_summary": comparison_data.get("ai_summary", {}),
        "page_heatmap": comparison_data.get("page_heatmap", []),
        "breakdown": comparison_data.get("breakdown", {}),
        "match_statistics": comparison_data.get("match_statistics", {}),
        "evidence_records": comparison_data.get("evidence_records", []),
    }



@router.get("/admin/download/highlighted/{upload_id}")



def download_highlighted_pdf(upload_id: int, type: str = "uploaded", current_user: models.User = Depends(require_roles("admin", "hod", "evaluator", "faculty")), db: Session = Depends(get_db)):
    from fastapi.responses import Response
    from highlighter import annotate_pdf_with_evidence

    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    user_role = normalize_role(current_user.role)
    if user_role == "evaluator":
        assigned_sections = get_evaluator_assigned_section_names(current_user.id, db)
        if upload.section_name not in assigned_sections:
            raise HTTPException(status_code=403, detail="Access denied: upload does not belong to your assigned sections")
    elif user_role in ["hod", "faculty"]:
        sec = db.query(models.Section).filter(models.Section.name == upload.section_name).first()
        assigned_sections = get_evaluator_assigned_section_names(current_user.id, db)
        is_same_dept = not (sec and sec.department and current_user.department and sec.department != current_user.department)
        if not is_same_dept and upload.section_name not in assigned_sections:
            raise HTTPException(status_code=403, detail="Access denied: upload is outside your department/assigned sections")

    matched_upload = None
    if upload.metadata_json and upload.metadata_json.get("matched_upload_id"):
        matched_upload_id = int(upload.metadata_json["matched_upload_id"])
        matched_upload = db.query(models.Upload).filter(models.Upload.id == matched_upload_id).first()

    if not matched_upload and upload.hash:
        matched_upload = (
            db.query(models.Upload)
            .filter(models.Upload.hash == upload.hash, models.Upload.id != upload.id)
            .order_by(models.Upload.id.asc())
            .first()
        )

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
    matched_pages = matched_upload.metadata_json.get("pages_text", []) if matched_upload and isinstance(matched_upload.metadata_json, dict) else []

    is_exact = (upload.hash and matched_upload and upload.hash == matched_upload.hash) or (upload.similarity_score == 100.0)
    comparison_data = compare_texts(original_text, matched_text, upload_pages, matched_pages, is_file_exact=is_exact)
    evidence_records = comparison_data.get("evidence_records", [])

    try:
        pdf_bytes = annotate_pdf_with_evidence(target_upload.file_path, evidence_records, target_type=type)
        return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=highlighted_{target_upload.file_name}"})
    except Exception as e:
        with open(target_upload.file_path, "rb") as f:
            return Response(content=f.read(), media_type="application/pdf")

@router.get("/admin/uploads")
def get_all_uploads(
    current_user: models.User = Depends(require_roles("admin", "hod")), 
    db: Session = Depends(get_db)
):
    """
    Submissions list for Admin and HOD.
    Returns consistent similarity_status, file size on disk, resolved section, and actual upload timestamp.
    """
    query = db.query(models.Upload, models.User).join(
        models.User, models.Upload.user_id == models.User.id
    ).filter(
        models.Upload.is_deleted == False
    )

    if normalize_role(current_user.role) == "hod":
        dept = current_user.department or "Computer Science"
        sections = db.query(models.Section).filter(models.Section.department == dept).all()
        sec_names = [s.name for s in sections]
        query = query.filter(models.Upload.section_name.in_(sec_names))

    uploads_with_users = query.order_by(models.Upload.upload_time.desc()).all()

    results = []
    for upload, user in uploads_with_users:
        # Determine file size
        file_size_bytes = 0
        if upload.file_path and os.path.exists(upload.file_path):
            try:
                file_size_bytes = os.path.getsize(upload.file_path)
            except Exception:
                pass

        if file_size_bytes >= 1024 * 1024:
            file_size_formatted = f"{file_size_bytes / (1024 * 1024):.1f} MB"
        elif file_size_bytes > 0:
            file_size_formatted = f"{file_size_bytes / 1024:.1f} KB"
        else:
            file_size_formatted = "N/A"

        # Determine authoritative similarity status
        sim_score = upload.similarity_score
        if sim_score is not None and sim_score >= 99.9:
            sim_status = "Exact Duplicate"
        elif sim_score is not None and sim_score >= 80.0:
            sim_status = "Potential Match"
        elif upload.extracted_text is not None:
            sim_status = "Clean"
        else:
            sim_status = "Pending Analysis"

        eval_record = db.query(models.Evaluation).filter(models.Evaluation.upload_id == upload.id).first()

        results.append({
            "id": upload.id,
            "file_name": upload.file_name,
            "file_type": upload.file_type,
            "file_size_bytes": file_size_bytes,
            "file_size_formatted": file_size_formatted,
            "uploaded_by_name": user.name,
            "uploaded_by_email": user.email,
            "registration_number": user.registration_number or "N/A",
            "upload_time": format_datetime_ist(upload.upload_time),
            "section_name": upload.section_name or user.section_name or "N/A",
            "assignment_title": upload.assignment_title or (upload.assignment.title if upload.assignment else None) or "N/A",
            "similarity_score": sim_score if sim_score is not None else 0.0,
            "similarity_status": sim_status,
            "duplicate_type": upload.duplicate_type or sim_status,
            "is_duplicate": (sim_score or 0) >= 80.0,
            "version": upload.version or 1,
            "evaluation_status": eval_record.status if eval_record else "Pending Evaluation",
            "marks": eval_record.marks if eval_record else None
        })

    return results



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



        is_assigned_section = upload.section_name in assigned



        is_matched_reference = False



        if not is_assigned_section:



            # Check if this upload is a matched reference for any submission in evaluator's sections



            match_exists = db.query(models.Upload).filter(



                models.Upload.section_name.in_(assigned),



                models.Upload.metadata_json.like(f'%"matched_upload_id": {upload.id}%')



            ).first()



            if not match_exists:



                match_exists = db.query(models.Upload).filter(



                    models.Upload.section_name.in_(assigned),



                    models.Upload.metadata_json.like(f'%"matched_upload_id": "{upload.id}"%')



                ).first()



            if match_exists:



                is_matched_reference = True



        if not is_assigned_section and not is_matched_reference:



            raise HTTPException(status_code=403, detail="Access denied: document not in your assigned sections")



    elif user_role == "hod":



        sec = db.query(models.Section).filter(models.Section.name == upload.section_name).first()



        is_same_dept = not (sec and sec.department and current_user.department and sec.department != current_user.department)



        if not is_same_dept:



            dept_sections = db.query(models.Section.name).filter(models.Section.department == current_user.department).all()



            dept_section_names = [s[0] for s in dept_sections]



            match_exists = db.query(models.Upload).filter(



                models.Upload.section_name.in_(dept_section_names),



                models.Upload.metadata_json.like(f'%"matched_upload_id": {upload.id}%')



            ).first()



            if not match_exists:



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



                add_to_chroma(unique_filename, embedding, {



                    "file_name": upload.file_name,



                    "file_path": upload.file_path,



                    "upload_id": upload.id,



                    "section_name": upload.section_name or "",



                    "assignment_title": upload.assignment_title or ""



                })



                



        processed_count += 1



        



    db.commit()



    return {"message": f"Successfully reprocessed {processed_count} uploads."}















# ─────────────────────────────────────────────────────────────────────────────



# Online Source Discovery endpoints



# ─────────────────────────────────────────────────────────────────────────────







@router.post("/submissions/{upload_id}/source-discovery")



def start_source_discovery(



    upload_id: int,



    force: bool = False,



    current_user: models.User = Depends(require_roles("admin", "hod", "evaluator", "faculty")),



    db: Session = Depends(get_db),



):



    """Trigger online source discovery for a submission. Evaluator/HOD/admin only."""



    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()



    if not upload:



        raise HTTPException(status_code=404, detail="Upload not found")







    user_role = normalize_role(current_user.role)



    if user_role == "evaluator":



        assigned = get_evaluator_assigned_section_names(current_user.id, db)



        if upload.section_name not in assigned:



            raise HTTPException(



                status_code=403,



                detail="Access denied: upload does not belong to your assigned sections",



            )



    elif user_role in ["hod", "faculty"]:



        sec = db.query(models.Section).filter(



            models.Section.name == upload.section_name



        ).first()



        assigned_sections = get_evaluator_assigned_section_names(current_user.id, db)



        is_same_dept = not (sec and sec.department and current_user.department and sec.department != current_user.department)



        if not is_same_dept and upload.section_name not in assigned_sections:



            raise HTTPException(



                status_code=403,



                detail="Access denied: upload is outside your department/assigned sections",



            )







    from source_discovery.service import run_source_discovery



    return run_source_discovery(upload_id, db, force_refresh=force)











@router.get("/submissions/{upload_id}/source-discovery")



def get_source_discovery(



    upload_id: int,



    current_user: models.User = Depends(require_roles("admin", "hod", "evaluator", "faculty")),



    db: Session = Depends(get_db),



):



    """Get the latest source discovery results for a submission."""



    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()



    if not upload:



        raise HTTPException(status_code=404, detail="Upload not found")







    user_role = normalize_role(current_user.role)



    if user_role == "evaluator":



        assigned = get_evaluator_assigned_section_names(current_user.id, db)



        if upload.section_name not in assigned:



            raise HTTPException(



                status_code=403,



                detail="Access denied: upload does not belong to your assigned sections",



            )



    elif user_role == "hod":



        sec = db.query(models.Section).filter(



            models.Section.name == upload.section_name



        ).first()



        if (



            sec



            and sec.department



            and current_user.department



            and sec.department != current_user.department



        ):



            raise HTTPException(



                status_code=403,



                detail="Access denied: upload is outside your department",



            )







    # Get the most recent job



    job = (



        db.query(models.OnlineSourceJob)



        .filter(models.OnlineSourceJob.upload_id == upload_id)



        .order_by(models.OnlineSourceJob.created_at.desc())



        .first()



    )



    if not job:



        return {"status": "not_started", "job_id": None, "results": []}







    results = (



        db.query(models.OnlineSourceResult)



        .filter(models.OnlineSourceResult.job_id == job.id)



        .all()



    )



    return {



        "status": job.status,



        "job_id": job.id,



        "queries_sent": job.queries_sent,



        "error_message": job.error_message,



        "created_at": job.created_at.isoformat() if job.created_at else None,



        "results": [



            {



                "id": r.id,



                "source_url": r.source_url,



                "source_title": r.source_title,



                "source_domain": r.source_domain,



                "matched_assignment_excerpt": r.matched_assignment_excerpt,



                "matched_source_excerpt": r.matched_source_excerpt,



                "match_method": r.match_method,



                "similarity_score": r.similarity_score,



                "source_published_date": r.source_published_date,



                "searched_at": r.searched_at.isoformat() if r.searched_at else None,



            }



            for r in results



        ],



    }





# ─────────────────────────────────────────────────────────────────────────────

# Faculty Dashboard Endpoints

# ─────────────────────────────────────────────────────────────────────────────



@router.get("/faculty/submissions")

def get_faculty_submissions(current_user: models.User = Depends(require_roles("faculty", "admin")), db: Session = Depends(get_db)):

    """Retrieve submissions for the faculty member's department and assigned sections."""

    dept = current_user.department or "Computer Science"

    user_role = normalize_role(current_user.role)



    if user_role == "admin":

        uploads = db.query(models.Upload).order_by(models.Upload.upload_time.desc()).all()

    else:

        sections = db.query(models.Section).filter(models.Section.department == dept).all()

        dept_section_names = [s.name for s in sections]

        assigned = get_evaluator_assigned_section_names(current_user.id, db)

        allowed_sections = list(set(dept_section_names + assigned))

        uploads = db.query(models.Upload).filter(

            models.Upload.section_name.in_(allowed_sections)

        ).order_by(models.Upload.upload_time.desc()).all() if allowed_sections else []



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

            "evaluation_status": eval_record.status if eval_record else "Pending Review",

            "marks": eval_record.marks if eval_record else None,

            "decision": eval_record.decision if eval_record else None,

            "comments": eval_record.comments if eval_record else None,

        })

    return results





@router.get("/faculty/analytics")

def get_faculty_analytics(current_user: models.User = Depends(require_roles("faculty", "admin")), db: Session = Depends(get_db)):

    """Department and assignment-level summary analytics for faculty."""

    dept = current_user.department or "Computer Science"

    user_role = normalize_role(current_user.role)



    if user_role == "admin":

        uploads = db.query(models.Upload).all()

    else:

        sections = db.query(models.Section).filter(models.Section.department == dept).all()

        dept_section_names = [s.name for s in sections]

        assigned = get_evaluator_assigned_section_names(current_user.id, db)

        allowed_sections = list(set(dept_section_names + assigned))

        uploads = db.query(models.Upload).filter(models.Upload.section_name.in_(allowed_sections)).all() if allowed_sections else []



    total_submissions = len(uploads)

    flagged_submissions = sum(1 for u in uploads if u.similarity_score and u.similarity_score >= 60.0)

    clean_submissions = sum(1 for u in uploads if not u.similarity_score or u.similarity_score < 30.0)



    assignment_map = {}

    section_map = {}

    for u in uploads:

        asgn = u.assignment_title or "Unassigned"

        assignment_map[asgn] = assignment_map.get(asgn, 0) + 1

        sec = u.section_name or "Unassigned"

        section_map[sec] = section_map.get(sec, 0) + 1



    return {

        "department": dept,

        "total_submissions": total_submissions,

        "flagged_submissions": flagged_submissions,

        "clean_submissions": clean_submissions,

        "evaluated_count": sum(1 for u in uploads if db.query(models.Evaluation).filter(models.Evaluation.upload_id == u.id, models.Evaluation.status == "Evaluation Completed").first()),

        "assignment_stats": assignment_map,

        "section_stats": section_map

    }


# =====================================================================
# ASSIGNMENT CREATION, SCHEDULING, AND MANAGEMENT ENDPOINTS
# =====================================================================

class AssignmentCreate(BaseModel):
    title: str
    subject: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    category: Optional[str] = "Assignment"
    department: Optional[str] = "Computer Science"
    start_date: Optional[str] = None
    due_date: str
    allow_late_submissions: Optional[bool] = True
    late_deadline: Optional[str] = None
    max_marks: Optional[float] = 100.0
    allowed_formats: Optional[str] = ".pdf,.docx,.txt"
    max_file_size_mb: Optional[float] = 50.0
    section_ids: List[int] = []
    status: Optional[str] = "Active"

class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    category: Optional[str] = None
    department: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    allow_late_submissions: Optional[bool] = None
    late_deadline: Optional[str] = None
    max_marks: Optional[float] = None
    allowed_formats: Optional[str] = None
    max_file_size_mb: Optional[float] = None
    section_ids: Optional[List[int]] = None
    status: Optional[str] = None

class AssignmentStatusUpdate(BaseModel):
    status: str


def format_datetime_ist(dt) -> str:
    """Formats any timestamp consistently to Institutional Timezone Asia/Kolkata (IST)."""
    if not dt:
        return "N/A"
    try:
        if isinstance(dt, str):
            if "IST" in dt:
                return dt
            try:
                dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
            except Exception:
                return dt
        from zoneinfo import ZoneInfo
        ist_zone = ZoneInfo("Asia/Kolkata")
        if getattr(dt, "tzinfo", None) is None:
            dt = dt.replace(tzinfo=timezone.utc)
        ist_dt = dt.astimezone(ist_zone)
        return ist_dt.strftime("%d-%m-%Y | %I:%M %p IST")
    except Exception:
        return str(dt)

def parse_date_str(d_str: Optional[str]) -> Optional[datetime]:
    if not d_str:
        return None
    cleaned = d_str.strip()
    try:
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass
    cleaned_fmt = cleaned.replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(cleaned_fmt, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None

@router.post("/assignments")
def create_assignment(
    data: AssignmentCreate,
    current_user: models.User = Depends(require_roles("faculty", "evaluator", "hod", "admin")),
    db: Session = Depends(get_db)
):
    """Create a new assignment and assign it to target sections."""
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Assignment title is required.")

    due_dt = parse_date_str(data.due_date)
    if not due_dt:
        raise HTTPException(status_code=400, detail="Invalid due_date format. Please use YYYY-MM-DD HH:MM.")

    start_dt = parse_date_str(data.start_date) or datetime.now(timezone.utc)
    late_dt = parse_date_str(data.late_deadline)

    dept = current_user.department or data.department or "Computer Science"

    # Verify sections exist
    if not data.section_ids:
        raise HTTPException(status_code=400, detail="At least one target section must be selected.")

    sections = db.query(models.Section).filter(models.Section.id.in_(data.section_ids)).all()
    if len(sections) != len(data.section_ids):
        raise HTTPException(status_code=400, detail="One or more selected sections do not exist.")

    # Authorization: Evaluators / Faculty can only assign sections in their dept / assigned sections
    user_role = normalize_role(current_user.role)
    if user_role in ["faculty", "evaluator"]:
        assigned_names = get_evaluator_assigned_section_names(current_user.id, db)
        dept_sec_ids = [s.id for s in db.query(models.Section).filter(models.Section.department == dept).all()]
        allowed_ids = set(dept_sec_ids + [s.id for s in sections if s.name in assigned_names])
        for sid in data.section_ids:
            if sid not in allowed_ids:
                raise HTTPException(status_code=403, detail="Cannot assign sections outside your department or assigned purview.")

    new_assign = models.Assignment(
        title=data.title.strip(),
        subject=data.subject.strip() if data.subject else None,
        description=data.description,
        instructions=data.instructions,
        category=data.category or "Assignment",
        creator_id=current_user.id,
        department=dept,
        start_date=start_dt,
        due_date=due_dt,
        allow_late_submissions=data.allow_late_submissions,
        late_deadline=late_dt,
        max_marks=data.max_marks or 100.0,
        allowed_formats=data.allowed_formats or ".pdf,.docx,.txt",
        max_file_size_mb=data.max_file_size_mb or 50.0,
        status=data.status or "Active",
        created_at=datetime.now(timezone(timedelta(hours=5, minutes=30))),
        updated_at=datetime.now(timezone(timedelta(hours=5, minutes=30)))
    )
    db.add(new_assign)
    db.flush()

    for sec in sections:
        mapping = models.AssignmentSection(
            assignment_id=new_assign.id,
            section_id=sec.id,
            section_name=sec.name,
            assigned_at=datetime.now(timezone(timedelta(hours=5, minutes=30)))
        )
        db.add(mapping)

    db.commit()
    db.refresh(new_assign)

        # Notify enrolled students
    try:
        if new_assign.status in ["Active", "Published"]:
            sec_names = [s.name for s in sections]
            notification_service.notify_section_students(
                db=db,
                section_names=sec_names,
                title=f"New Assignment: {new_assign.title}",
                message=f"A new assignment '{new_assign.title}' ({new_assign.subject or 'Coursework'}) has been posted for your section. Due date: {new_assign.due_date.strftime('%d-%m-%Y %I:%M %p') if new_assign.due_date else 'N/A'}.",
                type="assignment_published",
                link="/user-dashboard"
            )
    except Exception as e:
        logger.warning(f"Could not send assignment publication notifications: {e}")

    return {
        "message": "Assignment created successfully",
        "assignment_id": new_assign.id,
        "title": new_assign.title,
        "sections": [s.name for s in sections],
        "due_date": new_assign.due_date.isoformat() if new_assign.due_date else None
    }

@router.get("/assignments")
def list_assignments(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List assignments with role-scoped permissions:
    - Students see only assignments for their own section (excluding drafts), with personal submission status.
    - Faculty/Evaluators see assignments in their department/assigned sections with submission counters.
    - HOD/Admin see all assignments.
    """
    user_role = normalize_role(current_user.role)
    now_utc = datetime.now(timezone.utc)

    if user_role == "student":
        student_section = current_user.section_name
        # If student has no section assigned in database, strictly return empty list
        if not student_section:
            return []

        # Find unique assignment IDs explicitly linked to student's actual section
        assigned_sec_records = db.query(models.AssignmentSection).filter(
            models.AssignmentSection.section_name == student_section
        ).all()
        target_assignment_ids = list(set([r.assignment_id for r in assigned_sec_records if r.assignment_id]))

        if not target_assignment_ids:
            return []

        # Query only published/active/scheduled assignments (or closed if student has submitted)
        assignments = (
            db.query(models.Assignment)
            .filter(
                models.Assignment.id.in_(target_assignment_ids),
                models.Assignment.status.in_(["Active", "Published", "Scheduled", "Closed"])
            )
            .order_by(models.Assignment.due_date.asc())
            .all()
        )

        # Deduplicate by assignment ID
        seen_ids = set()
        deduped_assignments = []
        for a in assignments:
            if a.id not in seen_ids:
                seen_ids.add(a.id)
                deduped_assignments.append(a)

        result = []
        for a in deduped_assignments:
            # Check if this student has submitted (latest version)
            my_sub = (
                db.query(models.Upload)
                .filter(models.Upload.user_id == current_user.id, models.Upload.assignment_id == a.id)
                .order_by(models.Upload.version.desc())
                .first()
            )
            # Find evaluation for my submission
            eval_record = db.query(models.Evaluation).filter(models.Evaluation.upload_id == my_sub.id).first() if my_sub else None

            # Calculate submission status
            is_submitted = bool(my_sub)
            if is_submitted:
                if eval_record:
                    if eval_record.status == "Evaluation Completed":
                        sub_status = "Evaluated"
                    elif eval_record.status == "Resubmission Requested" or eval_record.decision == "Needs Revision":
                        sub_status = "Resubmission Requested"
                    else:
                        sub_status = eval_record.status or "Under Review"
                else:
                    sub_status = "Submitted Late" if my_sub.is_late else "Submitted"
            else:
                due_dt = a.due_date if (a.due_date and a.due_date.tzinfo) else (a.due_date.replace(tzinfo=timezone.utc) if a.due_date else None)
                start_dt = a.start_date if (a.start_date and a.start_date.tzinfo) else (a.start_date.replace(tzinfo=timezone.utc) if a.start_date else None)
                if start_dt and now_utc < start_dt:
                    sub_status = "Scheduled"
                elif due_dt and now_utc > due_dt:
                    sub_status = "Late Submissions Allowed" if a.allow_late_submissions else "Deadline Closed"
                else:
                    sub_status = "Pending Submission"

            result.append({
                "id": a.id,
                "title": a.title,
                "subject": a.subject,
                "description": a.description,
                "instructions": a.instructions,
                "category": a.category,
                "department": a.department,
                "creator_name": a.creator.name if a.creator else "Faculty",
                "start_date": a.start_date.isoformat() if a.start_date else None,
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "allow_late_submissions": a.allow_late_submissions,
                "late_deadline": a.late_deadline.isoformat() if a.late_deadline else None,
                "max_marks": a.max_marks,
                "allowed_formats": a.allowed_formats,
                "max_file_size_mb": a.max_file_size_mb,
                "status": a.status,
                "section_name": student_section,
                "is_submitted": is_submitted,
                "submission_status": sub_status,
                "is_late": my_sub.is_late if my_sub else False,
                "marks_awarded": eval_record.marks if eval_record else None,
                "evaluation_feedback": eval_record.comments if eval_record else None,
                "evaluation_decision": eval_record.decision if eval_record else None,
                "my_submission": {
                    "id": my_sub.id,
                    "file_name": my_sub.file_name,
                    "upload_time": my_sub.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if my_sub.upload_time else None,
                    "similarity_score": my_sub.similarity_score,
                    "is_late": my_sub.is_late,
                    "version": my_sub.version,
                    "evaluation_status": eval_record.status if eval_record else "Pending Evaluation",
                    "marks": eval_record.marks if eval_record else None,
                    "comments": eval_record.comments if eval_record else None,
                    "decision": eval_record.decision if eval_record else None
                } if my_sub else None
            })
        return result

    # Faculty / Evaluator / HOD / Admin view
    query = db.query(models.Assignment)
    if user_role in ["faculty", "evaluator"]:
        dept = current_user.department or "Computer Science"
        assigned_names = get_evaluator_assigned_section_names(current_user.id, db)
        # Match creator or department/assigned sections
        query = query.filter(
            (models.Assignment.creator_id == current_user.id) |
            (models.Assignment.department == dept)
        )
    elif user_role == "hod":
        dept = current_user.department or "Computer Science"
        query = query.filter(models.Assignment.department == dept)

    assignments = query.order_by(models.Assignment.created_at.desc()).all()

    output = []
    for a in assignments:
        sec_names = [s.section_name for s in a.sections]
        
        # Calculate real-time counts from database
        eligible_students_count = db.query(models.User).filter(
            models.User.role == "student",
            models.User.section_name.in_(sec_names)
        ).count() if sec_names else 0

        submissions_count = db.query(models.Upload).filter(models.Upload.assignment_id == a.id).count()
        late_count = db.query(models.Upload).filter(
            models.Upload.assignment_id == a.id,
            models.Upload.is_late == True
        ).count()
        
        # Evaluated submissions count
        evaluated_count = db.query(models.Evaluation).join(
            models.Upload, models.Evaluation.upload_id == models.Upload.id
        ).filter(
            models.Upload.assignment_id == a.id,
            models.Evaluation.status == "Evaluation Completed"
        ).count()

        output.append({
            "id": a.id,
            "title": a.title,
            "subject": a.subject,
            "description": a.description,
            "instructions": a.instructions,
            "category": a.category,
            "creator_id": a.creator_id,
            "creator_name": a.creator.name if a.creator else "Faculty",
            "department": a.department,
            "start_date": a.start_date.isoformat() if a.start_date else None,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "allow_late_submissions": a.allow_late_submissions,
            "max_marks": a.max_marks,
            "allowed_formats": a.allowed_formats,
            "max_file_size_mb": a.max_file_size_mb,
            "status": a.status,
            "sections": sec_names,
            "section_ids": [s.section_id for s in a.sections],
            "eligible_students_count": eligible_students_count,
            "submissions_count": submissions_count,
            "pending_submissions_count": max(0, eligible_students_count - submissions_count),
            "late_submissions_count": late_count,
            "evaluated_submissions_count": evaluated_count,
            "created_at": a.created_at.isoformat() if a.created_at else None
        })

    return output

@router.get("/assignments/{assignment_id}")
def get_assignment(
    assignment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve detailed assignment profile."""
    assign = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found")

    sec_names = [s.section_name for s in assign.sections]
    user_role = normalize_role(current_user.role)

    # If student, verify assignment belongs to student's section
    if user_role == "student":
        student_sec = current_user.section_name or "CSE-A"
        if student_sec not in sec_names:
            raise HTTPException(status_code=403, detail="Access denied: assignment is not assigned to your section")

    return {
        "id": assign.id,
        "title": assign.title,
        "subject": assign.subject,
        "description": assign.description,
        "instructions": assign.instructions,
        "category": assign.category,
        "creator_id": assign.creator_id,
        "creator_name": assign.creator.name if assign.creator else "Faculty",
        "department": assign.department,
        "start_date": assign.start_date.isoformat() if assign.start_date else None,
        "due_date": assign.due_date.isoformat() if assign.due_date else None,
        "allow_late_submissions": assign.allow_late_submissions,
        "max_marks": assign.max_marks,
        "allowed_formats": assign.allowed_formats,
        "max_file_size_mb": assign.max_file_size_mb,
        "status": assign.status,
        "sections": sec_names,
        "section_ids": [s.section_id for s in assign.sections]
    }

@router.put("/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    data: AssignmentUpdate,
    current_user: models.User = Depends(require_roles("faculty", "evaluator", "hod", "admin")),
    db: Session = Depends(get_db)
):
    """Update assignment details and target sections."""
    assign = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found")

    user_role = normalize_role(current_user.role)
    if user_role in ["faculty", "evaluator"] and assign.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot modify assignments created by another instructor")

    if data.title is not None:
        assign.title = data.title.strip()
    if data.subject is not None:
        assign.subject = data.subject.strip()
    if data.description is not None:
        assign.description = data.description
    if data.instructions is not None:
        assign.instructions = data.instructions
    if data.category is not None:
        assign.category = data.category
    if data.due_date is not None:
        d = parse_date_str(data.due_date)
        if d: assign.due_date = d
    if data.start_date is not None:
        s = parse_date_str(data.start_date)
        if s: assign.start_date = s
    if data.allow_late_submissions is not None:
        assign.allow_late_submissions = data.allow_late_submissions
    if data.max_marks is not None:
        assign.max_marks = data.max_marks
    if data.allowed_formats is not None:
        assign.allowed_formats = data.allowed_formats
    if data.max_file_size_mb is not None:
        assign.max_file_size_mb = data.max_file_size_mb
    if data.status is not None:
        assign.status = data.status

    # Update sections if specified
    if data.section_ids is not None:
        # Delete old mappings
        db.query(models.AssignmentSection).filter(models.AssignmentSection.assignment_id == assign.id).delete()
        sections = db.query(models.Section).filter(models.Section.id.in_(data.section_ids)).all()
        for sec in sections:
            db.add(models.AssignmentSection(
                assignment_id=assign.id,
                section_id=sec.id,
                section_name=sec.name,
                assigned_at=datetime.now(timezone(timedelta(hours=5, minutes=30)))
            ))

    assign.updated_at = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    db.commit()
    return {"message": "Assignment updated successfully"}

@router.patch("/assignments/{assignment_id}/status")
def update_assignment_status(
    assignment_id: int,
    data: AssignmentStatusUpdate,
    current_user: models.User = Depends(require_roles("faculty", "evaluator", "hod", "admin")),
    db: Session = Depends(get_db)
):
    """Update assignment status (Draft, Published, Active, Closed, Archived)."""
    valid_statuses = ["Draft", "Published", "Active", "Closed", "Archived"]
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid_statuses}")

    assign = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found")

    user_role = normalize_role(current_user.role)
    if user_role in ["faculty", "evaluator"] and assign.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot update status of an assignment created by another instructor")

    assign.status = data.status
    assign.updated_at = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    db.commit()
    return {"message": f"Assignment status updated to {data.status}"}

@router.delete("/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    current_user: models.User = Depends(require_roles("faculty", "evaluator", "hod", "admin")),
    db: Session = Depends(get_db)
):
    """Delete an assignment."""
    assign = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found")

    user_role = normalize_role(current_user.role)
    if user_role in ["faculty", "evaluator"] and assign.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete assignments created by another instructor")

    db.delete(assign)
    db.commit()
    return {"message": "Assignment deleted successfully"}

@router.get("/assignments/{assignment_id}/analytics")
def get_assignment_analytics(
    assignment_id: int,
    current_user: models.User = Depends(require_roles("faculty", "evaluator", "hod", "admin")),
    db: Session = Depends(get_db)
):
    """Compute comprehensive assignment-level analytics from real database records."""
    assign = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found")

    sec_names = [s.section_name for s in assign.sections]
    total_eligible = db.query(models.User).filter(
        models.User.role == "student",
        models.User.section_name.in_(sec_names)
    ).count() if sec_names else 0

    submissions = db.query(models.Upload).filter(models.Upload.assignment_id == assign.id).all()
    total_subs = len(submissions)
    late_subs = sum(1 for s in submissions if s.is_late)
    on_time_subs = total_subs - late_subs

    # Plagiarism breakdown
    flagged_similarity = sum(1 for s in submissions if s.similarity_score is not None and s.similarity_score >= 60.0)
    moderate_similarity = sum(1 for s in submissions if s.similarity_score is not None and 25.0 <= s.similarity_score < 60.0)
    clean_submissions = sum(1 for s in submissions if s.similarity_score is not None and s.similarity_score < 25.0)

    # Evaluation & Marks calculation (only from actual completed evaluations)
    sub_ids = [s.id for s in submissions]
    evaluations = db.query(models.Evaluation).filter(
        models.Evaluation.upload_id.in_(sub_ids),
        models.Evaluation.status == "Evaluation Completed",
        models.Evaluation.marks != None
    ).all() if sub_ids else []

    evaluated_count = len(evaluations)
    avg_marks = round(sum(e.marks for e in evaluations) / evaluated_count, 1) if evaluated_count > 0 else None

    # Completion rate
    completion_rate = round((total_subs / total_eligible) * 100, 1) if total_eligible > 0 else 0.0

    return {
        "assignment_id": assign.id,
        "assignment_title": assign.title,
        "subject": assign.subject,
        "due_date": assign.due_date.isoformat() if assign.due_date else None,
        "sections": sec_names,
        "total_eligible_students": total_eligible,
        "total_submissions": total_subs,
        "pending_submissions": max(0, total_eligible - total_subs),
        "on_time_submissions": on_time_subs,
        "late_submissions": late_subs,
        "completion_rate": completion_rate,
        "evaluated_submissions": evaluated_count,
        "average_marks": avg_marks,
        "flagged_similarity_count": flagged_similarity,
        "moderate_similarity_count": moderate_similarity,
        "clean_submissions_count": clean_submissions,
        "max_marks": assign.max_marks
    }


# ==========================================
# NOTIFICATION ENDPOINTS
# ==========================================
@router.get("/notifications")
def get_user_notifications(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notifs = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == current_user.id)
        .order_by(models.Notification.created_at.desc())
        .limit(30)
        .all()
    )
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).count()

    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "link": n.link,
                "is_read": n.is_read,
                "created_at": n.created_at.strftime("%d-%m-%Y %I:%M %p") if n.created_at else ""
            }
            for n in notifs
        ],
        "unread_count": unread_count
    }

@router.patch("/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notif = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.user_id == current_user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"status": "success"}

@router.post("/notifications/read-all")
def mark_all_notifications_read(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"status": "success"}



# =========================================================================
# ADMINISTRATOR STORAGE, SUBMISSION DELETION & AUDIT LOGGING ENDPOINTS
# =========================================================================

class BulkUploadDeleteRequest(BaseModel):
    upload_ids: List[int]
    permanent: bool = True

class DeleteAllSubmissionsRequest(BaseModel):
    confirmation_phrase: str

class BulkUserDeleteRequest(BaseModel):
    user_ids: List[int]
    preserve_academic_records: bool = True

class DeleteAllUsersRequest(BaseModel):
    confirmation_phrase: str
    preserve_academic_records: bool = True

@router.get("/admin/storage-stats")
def get_storage_stats(
    current_user: models.User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """Computes real-time physical disk storage used by submissions and identifies orphaned files."""
    uploads = db.query(models.Upload).filter(models.Upload.is_deleted == False).all()
    total_count = len(uploads)
    total_bytes = 0
    tracked_file_paths = set()

    for u in uploads:
        if u.file_path and os.path.exists(u.file_path):
            try:
                sz = os.path.getsize(u.file_path)
                total_bytes += sz
                tracked_file_paths.add(os.path.abspath(u.file_path))
            except Exception:
                pass

    orphaned_bytes = 0
    orphaned_count = 0
    if os.path.exists(UPLOAD_DIR):
        for fname in os.listdir(UPLOAD_DIR):
            fpath = os.path.abspath(os.path.join(UPLOAD_DIR, fname))
            if os.path.isfile(fpath) and fpath not in tracked_file_paths:
                try:
                    orphaned_bytes += os.path.getsize(fpath)
                    orphaned_count += 1
                except Exception:
                    pass

    return {
        "total_submissions": total_count,
        "total_storage_bytes": total_bytes,
        "total_storage_mb": round(total_bytes / (1024 * 1024), 2),
        "orphaned_count": orphaned_count,
        "orphaned_files_count": orphaned_count,
        "orphaned_storage_bytes": orphaned_bytes,
        "orphaned_files_bytes": orphaned_bytes,
        "orphaned_storage_mb": round(orphaned_bytes / (1024 * 1024), 2),
        "orphaned_files_mb": round(orphaned_bytes / (1024 * 1024), 2)
    }

@router.delete("/admin/uploads/{upload_id}")
def delete_individual_upload(
    upload_id: int,
    permanent: bool = Query(True),
    current_user: models.User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """Deletes an individual submission, cleans physical files if unreferenced, cleans ChromaDB, and logs audit record."""
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Submission not found")

    bytes_reclaimed = 0
    file_path = upload.file_path
    file_name = upload.file_name
    student_name = upload.owner.name if upload.owner else "Unknown"

    from ai_engine import delete_from_chroma
    try:
        delete_from_chroma([str(upload.id)])
    except Exception as e:
        logger.warning(f"ChromaDB deletion error: {e}")

    # Clean dependent DB records
    db.query(models.SubmissionEvidence).filter(
        (models.SubmissionEvidence.upload_id == upload.id) | 
        (models.SubmissionEvidence.reference_upload_id == upload.id)
    ).delete(synchronize_session=False)

    db.query(models.Evaluation).filter(models.Evaluation.upload_id == upload.id).delete(synchronize_session=False)
    db.query(models.OnlineSourceResult).filter(models.OnlineSourceResult.upload_id == upload.id).delete(synchronize_session=False)
    db.query(models.OnlineSourceJob).filter(models.OnlineSourceJob.upload_id == upload.id).delete(synchronize_session=False)
    db.query(models.Upload).filter(models.Upload.parent_upload_id == upload.id).update({"parent_upload_id": None})

    # Physical file cleanup if no other upload record references it
    if file_path and os.path.exists(file_path):
        other_refs = db.query(models.Upload).filter(
            models.Upload.file_path == file_path,
            models.Upload.id != upload.id
        ).count()
        if other_refs == 0:
            try:
                bytes_reclaimed = os.path.getsize(file_path)
                os.remove(file_path)
            except Exception as e:
                logger.warning(f"File removal error: {e}")

    db.delete(upload)

    audit = models.AuditLog(
        admin_id=current_user.id,
        admin_email=current_user.email,
        action_type="DELETE_SUBMISSION",
        target_id=str(upload_id),
        target_type="Upload",
        details={
            "file_name": file_name,
            "student_name": student_name,
            "bytes_reclaimed": bytes_reclaimed
        },
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "deleted_upload_id": upload_id,
        "message": f"Submission '{file_name}' deleted successfully",
        "bytes_reclaimed": bytes_reclaimed
    }

@router.post("/admin/uploads/bulk-delete")
def bulk_delete_uploads(
    data: BulkUploadDeleteRequest,
    current_user: models.User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """Deletes multiple selected submissions in a batch transaction."""
    if not data.upload_ids:
        raise HTTPException(status_code=400, detail="No submission IDs provided for deletion")

    deleted_count = 0
    total_bytes_reclaimed = 0
    failed_ids = []

    from ai_engine import delete_from_chroma

    for uid in data.upload_ids:
        upload = db.query(models.Upload).filter(models.Upload.id == uid).first()
        if not upload:
            failed_ids.append(uid)
            continue

        file_path = upload.file_path
        try:
            delete_from_chroma([str(upload.id)])
        except Exception:
            pass

        db.query(models.SubmissionEvidence).filter(
            (models.SubmissionEvidence.upload_id == upload.id) | 
            (models.SubmissionEvidence.reference_upload_id == upload.id)
        ).delete(synchronize_session=False)

        db.query(models.Evaluation).filter(models.Evaluation.upload_id == upload.id).delete(synchronize_session=False)
        db.query(models.OnlineSourceResult).filter(models.OnlineSourceResult.upload_id == upload.id).delete(synchronize_session=False)
        db.query(models.OnlineSourceJob).filter(models.OnlineSourceJob.upload_id == upload.id).delete(synchronize_session=False)
        db.query(models.Upload).filter(models.Upload.parent_upload_id == upload.id).update({"parent_upload_id": None})

        if file_path and os.path.exists(file_path):
            other_refs = db.query(models.Upload).filter(
                models.Upload.file_path == file_path,
                models.Upload.id != upload.id
            ).count()
            if other_refs == 0:
                try:
                    total_bytes_reclaimed += os.path.getsize(file_path)
                    os.remove(file_path)
                except Exception:
                    pass

        db.delete(upload)
        deleted_count += 1

    audit = models.AuditLog(
        admin_id=current_user.id,
        admin_email=current_user.email,
        action_type="BULK_DELETE_SUBMISSIONS",
        target_id=str(data.upload_ids),
        target_type="Upload",
        details={
            "deleted_count": deleted_count,
            "total_bytes_reclaimed": total_bytes_reclaimed,
            "failed_ids": failed_ids
        },
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "deleted_count": deleted_count,
        "total_bytes_reclaimed": total_bytes_reclaimed,
        "failed_ids": failed_ids
    }

@router.post("/admin/uploads/delete-all")
def delete_all_submissions(
    data: DeleteAllSubmissionsRequest,
    current_user: models.User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """High-risk workflow: Deletes all submissions while preserving assignments, sections, and users."""
    if data.confirmation_phrase.strip().upper() != "DELETE ALL SUBMISSIONS":
        raise HTTPException(
            status_code=400, 
            detail="Confirmation phrase mismatch. Please type exactly 'DELETE ALL SUBMISSIONS' to authorize."
        )

    uploads = db.query(models.Upload).all()
    deleted_count = len(uploads)
    total_bytes_reclaimed = 0

    from ai_engine import delete_from_chroma
    try:
        delete_from_chroma([str(u.id) for u in uploads])
    except Exception:
        pass

    db.query(models.SubmissionEvidence).delete(synchronize_session=False)
    db.query(models.Evaluation).delete(synchronize_session=False)
    db.query(models.OnlineSourceResult).delete(synchronize_session=False)
    db.query(models.OnlineSourceJob).delete(synchronize_session=False)

    if os.path.exists(UPLOAD_DIR):
        for fname in os.listdir(UPLOAD_DIR):
            fpath = os.path.join(UPLOAD_DIR, fname)
            if os.path.isfile(fpath):
                try:
                    total_bytes_reclaimed += os.path.getsize(fpath)
                    os.remove(fpath)
                except Exception:
                    pass

    db.query(models.Upload).delete(synchronize_session=False)

    audit = models.AuditLog(
        admin_id=current_user.id,
        admin_email=current_user.email,
        action_type="DELETE_ALL_SUBMISSIONS",
        target_id="ALL",
        target_type="Upload",
        details={
            "deleted_count": deleted_count,
            "total_bytes_reclaimed": total_bytes_reclaimed
        },
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "deleted_count": deleted_count,
        "total_bytes_reclaimed": total_bytes_reclaimed,
        "message": f"Successfully deleted all {deleted_count} submissions and reclaimed {round(total_bytes_reclaimed / (1024*1024), 2)} MB of storage."
    }

# =========================================================================
# ADMINISTRATOR USER MANAGEMENT & DELETION ENDPOINTS
# =========================================================================

@router.delete("/admin/users/{user_id}")
def delete_user(
    user_id: int,
    preserve_academic_records: bool = Query(True),
    current_user: models.User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """Deletes or archives a user account with strict safeguards protecting administrators and academic records."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own administrator account.")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found")

    if user.role == "admin":
        active_admins = db.query(models.User).filter(
            models.User.role == "admin",
            models.User.is_deleted == False
        ).count()
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last active Administrator account. The system requires at least one active administrator.")

    user_email = user.email
    user_role = user.role
    user_name = user.name

    if preserve_academic_records:
        user.is_active = False
        user.is_deleted = True
        user.name = f"{user_name} [Archived]"
        db.query(models.EvaluatorSection).filter(models.EvaluatorSection.evaluator_id == user.id).delete(synchronize_session=False)
        db.query(models.Notification).filter(models.Notification.user_id == user.id).delete(synchronize_session=False)
    else:
        user_uploads = db.query(models.Upload).filter(models.Upload.user_id == user.id).all()
        from ai_engine import delete_from_chroma
        try:
            delete_from_chroma([str(u.id) for u in user_uploads])
        except Exception:
            pass

        for u in user_uploads:
            if u.file_path and os.path.exists(u.file_path):
                try:
                    os.remove(u.file_path)
                except Exception:
                    pass
            db.query(models.SubmissionEvidence).filter(
                (models.SubmissionEvidence.upload_id == u.id) | 
                (models.SubmissionEvidence.reference_upload_id == u.id)
            ).delete(synchronize_session=False)
            db.query(models.Evaluation).filter(models.Evaluation.upload_id == u.id).delete(synchronize_session=False)
            db.delete(u)

        db.query(models.EvaluatorSection).filter(models.EvaluatorSection.evaluator_id == user.id).delete(synchronize_session=False)
        db.query(models.Notification).filter(models.Notification.user_id == user.id).delete(synchronize_session=False)
        db.delete(user)

    audit = models.AuditLog(
        admin_id=current_user.id,
        admin_email=current_user.email,
        action_type="DELETE_USER",
        target_id=str(user_id),
        target_type="User",
        details={
            "name": user_name,
            "email": user_email,
            "role": user_role,
            "preserved_academic_records": preserve_academic_records
        },
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "status": "archived" if preserve_academic_records else "deleted",
        "message": f"User '{user_email}' ({user_role}) {'archived and academic records preserved' if preserve_academic_records else 'permanently removed'} successfully."
    }

@router.post("/admin/users/bulk-delete")
def bulk_delete_users(
    data: BulkUserDeleteRequest,
    current_user: models.User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """Bulk deletes selected users with administrator protection."""
    if not data.user_ids:
        raise HTTPException(status_code=400, detail="No user IDs provided")

    target_ids = [uid for uid in data.user_ids if uid != current_user.id]
    if not target_ids:
        raise HTTPException(status_code=400, detail="Cannot delete your own administrator account.")

    deleted_count = 0
    for uid in target_ids:
        u = db.query(models.User).filter(models.User.id == uid).first()
        if not u:
            continue
        if u.role == "admin":
            active_admins = db.query(models.User).filter(
                models.User.role == "admin",
                models.User.is_deleted == False
            ).count()
            if active_admins <= 1:
                continue

        if data.preserve_academic_records:
            u.is_active = False
            u.is_deleted = True
            u.name = f"{u.name} [Archived]"
            db.query(models.EvaluatorSection).filter(models.EvaluatorSection.evaluator_id == u.id).delete(synchronize_session=False)
            db.query(models.Notification).filter(models.Notification.user_id == u.id).delete(synchronize_session=False)
        else:
            ups = db.query(models.Upload).filter(models.Upload.user_id == u.id).all()
            for up in ups:
                if up.file_path and os.path.exists(up.file_path):
                    try:
                        os.remove(up.file_path)
                    except Exception:
                        pass
                db.query(models.SubmissionEvidence).filter(
                    (models.SubmissionEvidence.upload_id == up.id) | 
                    (models.SubmissionEvidence.reference_upload_id == up.id)
                ).delete(synchronize_session=False)
                db.query(models.Evaluation).filter(models.Evaluation.upload_id == up.id).delete(synchronize_session=False)
                db.delete(up)
            db.query(models.EvaluatorSection).filter(models.EvaluatorSection.evaluator_id == u.id).delete(synchronize_session=False)
            db.query(models.Notification).filter(models.Notification.user_id == u.id).delete(synchronize_session=False)
            db.delete(u)

        deleted_count += 1

    audit = models.AuditLog(
        admin_id=current_user.id,
        admin_email=current_user.email,
        action_type="BULK_DELETE_USERS",
        target_id=str(target_ids),
        target_type="User",
        details={
            "deleted_count": deleted_count,
            "preserved_records": data.preserve_academic_records
        },
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()

    return {"success": True, "deleted_count": deleted_count}

@router.post("/admin/users/delete-all")
def delete_all_users(
    data: DeleteAllUsersRequest,
    current_user: models.User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """High-risk action: Deletes all user accounts while permanently protecting the active administrator."""
    if data.confirmation_phrase.strip().upper() != "DELETE ALL USERS":
        raise HTTPException(
            status_code=400, 
            detail="Confirmation phrase mismatch. Please type exactly 'DELETE ALL USERS' to authorize."
        )

    other_users = db.query(models.User).filter(models.User.id != current_user.id).all()
    deleted_count = len(other_users)

    for u in other_users:
        if data.preserve_academic_records:
            u.is_active = False
            u.is_deleted = True
            u.name = f"{u.name} [Archived]"
            db.query(models.EvaluatorSection).filter(models.EvaluatorSection.evaluator_id == u.id).delete(synchronize_session=False)
            db.query(models.Notification).filter(models.Notification.user_id == u.id).delete(synchronize_session=False)
        else:
            ups = db.query(models.Upload).filter(models.Upload.user_id == u.id).all()
            for up in ups:
                if up.file_path and os.path.exists(up.file_path):
                    try:
                        os.remove(up.file_path)
                    except Exception:
                        pass
                db.query(models.SubmissionEvidence).filter(
                    (models.SubmissionEvidence.upload_id == up.id) | 
                    (models.SubmissionEvidence.reference_upload_id == up.id)
                ).delete(synchronize_session=False)
                db.query(models.Evaluation).filter(models.Evaluation.upload_id == up.id).delete(synchronize_session=False)
                db.delete(up)
            db.query(models.EvaluatorSection).filter(models.EvaluatorSection.evaluator_id == u.id).delete(synchronize_session=False)
            db.query(models.Notification).filter(models.Notification.user_id == u.id).delete(synchronize_session=False)
            db.delete(u)

    audit = models.AuditLog(
        admin_id=current_user.id,
        admin_email=current_user.email,
        action_type="DELETE_ALL_USERS",
        target_id="ALL_EXCEPT_CURRENT_ADMIN",
        target_type="User",
        details={
            "deleted_count": deleted_count,
            "protected_admin": current_user.email
        },
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "deleted_count": deleted_count,
        "message": f"Successfully processed {deleted_count} user accounts. The active administrator account ({current_user.email}) remains protected and active."
    }

@router.get("/admin/audit-logs")
def get_audit_logs(
    limit: int = 50,
    current_user: models.User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """Retrieves immutable audit trail of administrative destructive actions and role modifications."""
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "admin_id": l.admin_id,
            "admin_email": l.admin_email,
            "admin_name": l.admin_email,
            "action_type": l.action_type,
            "target_id": l.target_id,
            "target_type": l.target_type,
            "details": str(l.details) if isinstance(l.details, (dict, list)) else (l.details or ""),
            "timestamp": format_datetime_ist(l.timestamp)
        }
        for l in logs
    ]
