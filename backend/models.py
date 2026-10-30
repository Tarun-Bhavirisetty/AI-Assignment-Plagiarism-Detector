from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, timedelta
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="student") # student (or legacy 'user'), faculty, evaluator, hod, admin
    registration_number = Column(String, unique=True, index=True, nullable=True)
    department = Column(String, default="Computer Science")
    section_name = Column(String, default="CSE-A", index=True, nullable=True) # Student section assignment (e.g. CSE-A)
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True, index=True)
    verification_token_expires = Column(DateTime, nullable=True)
    
    uploads = relationship("Upload", back_populates="owner")
    assigned_sections = relationship("EvaluatorSection", foreign_keys="EvaluatorSection.evaluator_id", back_populates="evaluator")
    created_assignments = relationship("Assignment", back_populates="creator")

class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    department = Column(String, default="Computer Science")

    evaluators = relationship("EvaluatorSection", back_populates="section", cascade="all, delete-orphan")
    assignments = relationship("AssignmentSection", back_populates="section", cascade="all, delete-orphan")

class EvaluatorSection(Base):
    __tablename__ = "evaluator_sections"
    __table_args__ = (UniqueConstraint('evaluator_id', 'section_id', name='_evaluator_section_uc'),)

    id = Column(Integer, primary_key=True, index=True)
    evaluator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))

    evaluator = relationship("User", foreign_keys=[evaluator_id], back_populates="assigned_sections")
    section = relationship("Section", back_populates="evaluators")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    subject = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    category = Column(String, default="Assignment") # Assignment, Homework, Lab Report, Project
    creator_id = Column(Integer, ForeignKey("users.id"), index=True)
    department = Column(String, default="Computer Science")
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=False, index=True)
    allow_late_submissions = Column(Boolean, default=True)
    late_deadline = Column(DateTime, nullable=True)
    max_marks = Column(Float, default=100.0)
    allowed_formats = Column(String, default=".pdf,.docx,.txt")
    max_file_size_mb = Column(Float, default=50.0)
    attachment_path = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)
    status = Column(String, default="Active") # Draft, Scheduled, Published, Active, Closed, Archived
    created_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))

    creator = relationship("User", back_populates="created_assignments")
    sections = relationship("AssignmentSection", back_populates="assignment", cascade="all, delete-orphan")
    submissions = relationship("Upload", back_populates="assignment")

class AssignmentSection(Base):
    __tablename__ = "assignment_sections"
    __table_args__ = (UniqueConstraint('assignment_id', 'section_id', name='_assignment_section_uc'),)

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"), index=True)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    section_name = Column(String, index=True)
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))

    assignment = relationship("Assignment", back_populates="sections")
    section = relationship("Section", back_populates="assignments")

class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), unique=True, index=True)
    evaluator_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    marks = Column(Float, nullable=True)
    max_marks = Column(Float, default=100.0)
    status = Column(String, default="Submitted") # Submitted, Ready for Review, Under Review, Evaluation Completed, Requires Further Review
    decision = Column(String, nullable=True) # Cleared, Needs Revision, Academic Overlap Flagged
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))

    upload = relationship("Upload", backref="evaluation_record")
    evaluator = relationship("User", foreign_keys=[evaluator_id])

class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=True, index=True)
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
    is_late = Column(Boolean, default=False)
    version = Column(Integer, default=1)
    parent_upload_id = Column(Integer, ForeignKey("uploads.id"), nullable=True, index=True)
    
    extracted_text = Column(String, nullable=True)
    cleaned_text = Column(String, nullable=True)

    owner = relationship("User", back_populates="uploads")
    assignment = relationship("Assignment", back_populates="submissions")
    evidence_records = relationship("SubmissionEvidence", foreign_keys="SubmissionEvidence.upload_id", cascade="all, delete-orphan")

class SubmissionEvidence(Base):
    __tablename__ = "submission_evidence"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), index=True)
    reference_upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=True, index=True)
    matched_sentence = Column(Text, nullable=True)
    reference_sentence = Column(Text, nullable=True)
    uploaded_page = Column(Integer, nullable=True)
    reference_page = Column(Integer, nullable=True)
    start_offset = Column(Integer, nullable=True)
    end_offset = Column(Integer, nullable=True)
    ref_start_offset = Column(Integer, nullable=True)
    ref_end_offset = Column(Integer, nullable=True)
    sentence_index = Column(Integer, nullable=True)
    paragraph_index = Column(Integer, nullable=True)
    match_type = Column(String, nullable=True) # exact, semantic, lexical, paraphrased
    similarity_score = Column(Float, nullable=True)
    color = Column(String, default="red") # red, yellow, orange
    location_status = Column(String, default="mapped") # mapped, page_only, unavailable
    created_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))

    upload = relationship("Upload", foreign_keys=[upload_id], back_populates="evidence_records")
    reference_upload = relationship("Upload", foreign_keys=[reference_upload_id])

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

class OnlineSourceJob(Base):
    __tablename__ = "online_source_jobs"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), index=True)
    status = Column(String, default="pending")  # pending, processing, completed, failed
    provider = Column(String, default="tavily")
    queries_sent = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))

    upload = relationship("Upload", backref="source_jobs")

class OnlineSourceResult(Base):
    __tablename__ = "online_source_results"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("online_source_jobs.id", ondelete="CASCADE"), index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), index=True)
    source_url = Column(String)
    source_title = Column(String, nullable=True)
    source_domain = Column(String, nullable=True)
    matched_assignment_excerpt = Column(Text, nullable=True)
    matched_source_excerpt = Column(Text, nullable=True)
    match_method = Column(String, nullable=True)
    similarity_score = Column(Float, nullable=True)
    source_published_date = Column(String, nullable=True)
    searched_at = Column(DateTime, default=lambda: datetime.now(timezone(timedelta(hours=5, minutes=30))))

    job = relationship("OnlineSourceJob", backref="results")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String, default="info") # assignment_published, submission_received, deadline_reminder, feedback_provided, resubmission_requested
    link = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="notifications")
