from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, timedelta
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="user")
    
    uploads = relationship("Upload", back_populates="owner")


class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)



class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    file_name = Column(String)
    file_type = Column(String)
    hash = Column(String, index=True) # SHA256 exact hash
    file_path = Column(String, nullable=True) # Permanent storage path
    upload_time = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))
    similarity_score = Column(Float, nullable=True) # If it's a similar upload
    metadata_json = Column(JSON, nullable=True) # size, format, dimensions, duration, etc.
    
    section_name = Column(String, nullable=True)
    assignment_title = Column(String, nullable=True)
    duplicate_type = Column(String, nullable=True)
    matched_student = Column(String, nullable=True)
    
    extracted_text = Column(String, nullable=True)
    cleaned_text = Column(String, nullable=True)

    owner = relationship("User", back_populates="uploads")

class SimilarityMatch(Base):
    __tablename__ = "similarity_matches"

    id = Column(Integer, primary_key=True, index=True)
    source_upload_id = Column(Integer, ForeignKey("uploads.id"), index=True)
    target_upload_id = Column(Integer, ForeignKey("uploads.id"), index=True)
    match_type = Column(String) # exact, lexical, semantic, image, structural
    similarity_score = Column(Float)
    source_page = Column(Integer, nullable=True)
    target_page = Column(Integer, nullable=True)
    matched_text = Column(String, nullable=True)
    
class DocumentSegment(Base):
    __tablename__ = "document_segments"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id"), index=True)
    segment_type = Column(String) # sentence, paragraph, question
    segment_index = Column(Integer)
    page_number = Column(Integer, nullable=True)
    content = Column(String)

class PlagiarismCase(Base):
    __tablename__ = "plagiarism_cases"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id"), unique=True)
    status = Column(String, default="New") # New, Under Review, Resolved, Dismissed
    teacher_notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))

class DetectionConfiguration(Base):
    __tablename__ = "detection_configs"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value_float = Column(Float, nullable=True)
    value_string = Column(String, nullable=True)
