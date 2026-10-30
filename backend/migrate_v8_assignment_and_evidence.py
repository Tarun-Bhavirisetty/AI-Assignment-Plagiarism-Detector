"""
Migration v8: Assignment Management, Scheduling & Submission Evidence
- Adds section_name to users table
- Adds assignment_id, is_late, version to uploads table
- Creates assignments table
- Creates assignment_sections table
- Creates submission_evidence table
- Populates demo assignments and sample student section mappings safely
"""
import sqlite3
import os
from datetime import datetime, timezone, timedelta

DB_FILE = os.path.join(os.path.dirname(__file__), "metaguard.db# JWT Authentication")
if not os.path.exists(DB_FILE):
    alt = os.path.join(os.path.dirname(__file__), "metaguard.db")
    if os.path.exists(alt):
        DB_FILE = alt

print(f"Connecting to database: {DB_FILE}")
conn = sqlite3.connect(DB_FILE)
cursor = conn.cursor()

# 1. Add section_name to users table if missing
cursor.execute("PRAGMA table_info(users)")
user_cols = [row[1] for row in cursor.fetchall()]
if "section_name" not in user_cols:
    print("Adding section_name column to users table...")
    cursor.execute("ALTER TABLE users ADD COLUMN section_name VARCHAR DEFAULT 'CSE-A'")

# 2. Add assignment_id, is_late, version to uploads table if missing
cursor.execute("PRAGMA table_info(uploads)")
upload_cols = [row[1] for row in cursor.fetchall()]
if "assignment_id" not in upload_cols:
    print("Adding assignment_id column to uploads table...")
    cursor.execute("ALTER TABLE uploads ADD COLUMN assignment_id INTEGER REFERENCES assignments(id)")
if "is_late" not in upload_cols:
    print("Adding is_late column to uploads table...")
    cursor.execute("ALTER TABLE uploads ADD COLUMN is_late BOOLEAN DEFAULT 0")
if "version" not in upload_cols:
    print("Adding version column to uploads table...")
    cursor.execute("ALTER TABLE uploads ADD COLUMN version INTEGER DEFAULT 1")

# 3. Create assignments table if not exists
cursor.execute("""
CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR NOT NULL,
    subject VARCHAR,
    description TEXT,
    instructions TEXT,
    category VARCHAR DEFAULT 'Assignment',
    creator_id INTEGER REFERENCES users(id),
    department VARCHAR DEFAULT 'Computer Science',
    start_date DATETIME,
    due_date DATETIME NOT NULL,
    allow_late_submissions BOOLEAN DEFAULT 1,
    late_deadline DATETIME,
    max_marks FLOAT DEFAULT 100.0,
    allowed_formats VARCHAR DEFAULT '.pdf,.docx,.txt',
    max_file_size_mb FLOAT DEFAULT 50.0,
    attachment_path VARCHAR,
    attachment_name VARCHAR,
    status VARCHAR DEFAULT 'Active',
    created_at DATETIME,
    updated_at DATETIME
)
""")

# 4. Create assignment_sections table if not exists
cursor.execute("""
CREATE TABLE IF NOT EXISTS assignment_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    section_name VARCHAR NOT NULL,
    assigned_at DATETIME,
    UNIQUE(assignment_id, section_id)
)
""")

# 5. Create submission_evidence table if not exists
cursor.execute("""
CREATE TABLE IF NOT EXISTS submission_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    reference_upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
    matched_sentence TEXT,
    reference_sentence TEXT,
    uploaded_page INTEGER,
    reference_page INTEGER,
    start_offset INTEGER,
    end_offset INTEGER,
    ref_start_offset INTEGER,
    ref_end_offset INTEGER,
    sentence_index INTEGER,
    paragraph_index INTEGER,
    match_type VARCHAR,
    similarity_score FLOAT,
    color VARCHAR DEFAULT 'red',
    location_status VARCHAR DEFAULT 'mapped',
    created_at DATETIME
)
""")

# Create indexes for fast lookup
cursor.execute("CREATE INDEX IF NOT EXISTS ix_assignments_creator ON assignments(creator_id)")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_assignments_due_date ON assignments(due_date)")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_assignment_sections_assign ON assignment_sections(assignment_id)")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_assignment_sections_sec ON assignment_sections(section_id)")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_submission_evidence_upload ON submission_evidence(upload_id)")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_submission_evidence_ref ON submission_evidence(reference_upload_id)")

# 6. Ensure default sections exist
existing_sections = [row[0] for row in cursor.execute("SELECT name FROM sections").fetchall()]
for sec_name in ["SEC-A", "CSE-A", "CSE-B", "AIML-A", "DS-A"]:
    if sec_name not in existing_sections:
        cursor.execute("INSERT INTO sections (name, department) VALUES (?, 'Computer Science')", (sec_name,))
        print(f"Created section: {sec_name}")

conn.commit()
conn.close()
print("Migration v8 completed successfully!")
