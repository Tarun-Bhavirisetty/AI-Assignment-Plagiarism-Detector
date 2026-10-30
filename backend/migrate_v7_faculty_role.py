import os
import sqlite3
import hashlib
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./metaguard.db# JWT Authentication")
db_path = DATABASE_URL.replace("sqlite:///", "")
if db_path.startswith("./"):
    db_path = db_path[2:]

backend_dir = os.path.dirname(os.path.abspath(__file__))
actual_db_path = os.path.join(backend_dir, os.path.basename(db_path))
if not os.path.exists(actual_db_path):
    actual_db_path = os.path.join(backend_dir, "metaguard.db# JWT Authentication")

print(f"[Migration v7] Target database: {actual_db_path}")

def get_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def migrate():
    if not os.path.exists(actual_db_path):
        raise FileNotFoundError(f"Database not found at {actual_db_path}")

    conn = sqlite3.connect(actual_db_path)
    cursor = conn.cursor()

    # 1. Verify users table has role column
    cursor.execute("PRAGMA table_info(users)")
    cols = [r[1] for r in cursor.fetchall()]
    print(f"[Migration v7] Users columns: {cols}")

    # 2. Check for faculty demo account or verify existing
    cursor.execute("SELECT id, name, email, role FROM users WHERE role = 'faculty';")
    faculty_users = cursor.fetchall()
    print(f"[Migration v7] Existing faculty count: {len(faculty_users)}")

    if len(faculty_users) == 0:
        print("[Migration v7] Creating default verified Faculty account: faculty@metaguard.com...")
        faculty_email = "faculty@metaguard.com"
        cursor.execute("SELECT id FROM users WHERE email = ?;", (faculty_email,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("UPDATE users SET role = 'faculty', is_verified = 1 WHERE email = ?;", (faculty_email,))
        else:
            hashed_pw = get_hash("faculty123")
            cursor.execute("""
                INSERT INTO users (name, email, password_hash, role, registration_number, department, is_verified)
                VALUES (?, ?, ?, 'faculty', 'FAC001', 'Computer Science', 1);
            """, ("Dr. A. Sharma (Faculty)", faculty_email, hashed_pw))
        conn.commit()
        print("[Migration v7] Default faculty account created: faculty@metaguard.com / faculty123")

    conn.close()
    print("[Migration v7] Migration v7 completed successfully!")

if __name__ == "__main__":
    migrate()
