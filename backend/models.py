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
