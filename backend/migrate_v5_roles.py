import os
import sqlite3
from dotenv import load_dotenv

load_dotenv()

# Get database path from DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./metaguard.db# JWT Authentication")
db_path = DATABASE_URL.replace("sqlite:///", "")
if db_path.startswith("./"):
    db_path = db_path[2:]

# Handle relative paths from backend directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
actual_db_path = os.path.join(backend_dir, os.path.basename(db_path))
if not os.path.exists(actual_db_path):
    # Try direct path
    actual_db_path = os.path.join(backend_dir, "metaguard.db# JWT Authentication")

print(f"Connecting to database at: {actual_db_path}")

def migrate():
    conn = sqlite3.connect(actual_db_path)
    cursor = conn.cursor()

    # 1. Inspect existing columns in users table
    cursor.execute("PRAGMA table_info(users)")
    user_columns = [row[1] for row in cursor.fetchall()]
    print(f"Existing columns in 'users': {user_columns}")

    # Add new columns to users if missing
    new_user_cols = {
        "registration_number": "VARCHAR",
        "department": "VARCHAR DEFAULT 'Computer Science'",
        "is_verified": "BOOLEAN DEFAULT 0",
        "verification_token": "VARCHAR",
        "verification_token_expires": "DATETIME"
    }

    for col_name, col_type in new_user_cols.items():
        if col_name not in user_columns:
            print(f"Adding column '{col_name}' to 'users' table...")
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type};")

    # Migration policy: Mark existing users as verified and assign departments so no legacy account is locked out!
    print("Setting is_verified=1 for existing legacy users...")
    cursor.execute("UPDATE users SET is_verified = 1 WHERE is_verified = 0 OR is_verified IS NULL;")

    # If any user is 'user', let's keep role as 'user' or 'student'
    # 2. Inspect existing columns in sections table
    cursor.execute("PRAGMA table_info(sections)")
    sec_columns = [row[1] for row in cursor.fetchall()]
    if "department" not in sec_columns:
        print("Adding column 'department' to 'sections' table...")
        cursor.execute("ALTER TABLE sections ADD COLUMN department VARCHAR DEFAULT 'Computer Science';")

    # 3. Create evaluator_sections table if it doesn't exist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS evaluator_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evaluator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        assigned_by_id INTEGER REFERENCES users(id),
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(evaluator_id, section_id)
    );
    """)
    print("Checked/created 'evaluator_sections' table.")

    # 4. Create evaluations table if it doesn't exist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id INTEGER NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE CASCADE,
        evaluator_id INTEGER REFERENCES users(id),
        marks REAL,
        max_marks REAL DEFAULT 100.0,
        status VARCHAR DEFAULT 'Submitted',
        decision VARCHAR,
        comments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    print("Checked/created 'evaluations' table.")

    conn.commit()
    conn.close()
    print("Migration V5 completed successfully!")

if __name__ == "__main__":
    migrate()
