import os
import sqlite3
import json
from dotenv import load_dotenv

load_dotenv()

# Get database path from DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./metaguard.db# JWT Authentication")
db_path = DATABASE_URL.replace("sqlite:///", "")
if db_path.startswith("./"):
    db_path = db_path[2:]

backend_dir = os.path.dirname(os.path.abspath(__file__))
actual_db_path = os.path.join(backend_dir, os.path.basename(db_path))
if not os.path.exists(actual_db_path):
    actual_db_path = os.path.join(backend_dir, "metaguard.db# JWT Authentication")

print(f"[Migration v6] Target database: {actual_db_path}")

def migrate():
    if not os.path.exists(actual_db_path):
        raise FileNotFoundError(f"Database not found at {actual_db_path}")

    conn = sqlite3.connect(actual_db_path)
    cursor = conn.cursor()

    # 1. Inspect existing tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"[Migration v6] Existing tables: {tables}")

    # 2. Create online_source_jobs table if missing
    if "online_source_jobs" not in tables:
        print("[Migration v6] Creating 'online_source_jobs' table...")
        cursor.execute("""
            CREATE TABLE online_source_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
                status VARCHAR(50) DEFAULT 'pending',
                provider VARCHAR(50) DEFAULT 'tavily',
                queries_sent INTEGER DEFAULT 0,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_online_source_jobs_upload_id ON online_source_jobs (upload_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_online_source_jobs_id ON online_source_jobs (id);")
        print("[Migration v6] 'online_source_jobs' table created.")
    else:
        print("[Migration v6] 'online_source_jobs' table already exists.")

    # 3. Create online_source_results table if missing
    if "online_source_results" not in tables:
        print("[Migration v6] Creating 'online_source_results' table...")
        cursor.execute("""
            CREATE TABLE online_source_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL REFERENCES online_source_jobs(id) ON DELETE CASCADE,
                upload_id INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
                source_url TEXT,
                source_title TEXT,
                source_domain TEXT,
                matched_assignment_excerpt TEXT,
                matched_source_excerpt TEXT,
                match_method VARCHAR(50),
                similarity_score FLOAT,
                source_published_date TEXT,
                searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_online_source_results_job_id ON online_source_results (job_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_online_source_results_upload_id ON online_source_results (upload_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_online_source_results_id ON online_source_results (id);")
        print("[Migration v6] 'online_source_results' table created.")
    else:
        print("[Migration v6] 'online_source_results' table already exists.")

    # 4. Safe Repair: Check historical uploads where matched_upload_id is missing
    print("[Migration v6] Auditing historical uploads for missing matched_upload_id...")
    cursor.execute("SELECT id, file_name, file_path, hash, similarity_score, duplicate_type, metadata_json, matched_student FROM uploads;")
    uploads = cursor.fetchall()
    repaired_count = 0

    for u_id, f_name, f_path, f_hash, sim_score, dup_type, meta_json_raw, matched_stud in uploads:
        meta = {}
        if meta_json_raw:
            try:
                meta = json.loads(meta_json_raw)
            except Exception:
                meta = {}

        if sim_score and sim_score > 0 and not meta.get("matched_upload_id"):
            # Try to resolve matched reference
            matched_ref = None

            # 1. Exact hash
            if f_hash:
                cursor.execute("SELECT id, user_id FROM uploads WHERE hash = ? AND id != ? ORDER BY id ASC LIMIT 1;", (f_hash, u_id))
                row = cursor.fetchone()
                if row:
                    matched_ref = row

            # 2. If no hash match but matched_student is known, find student's upload
            if not matched_ref and matched_stud:
                cursor.execute("""
                    SELECT u.id, u.user_id FROM uploads u
                    JOIN users usr ON u.user_id = usr.id
                    WHERE usr.name = ? AND u.id != ?
                    ORDER BY u.id ASC LIMIT 1;
                """, (matched_stud, u_id))
                row = cursor.fetchone()
                if row:
                    matched_ref = row

            # 3. For known historical cases: U7 is a Similar Duplicate of U5 (same student resume)
            if not matched_ref and u_id == 7:
                cursor.execute("SELECT id, user_id FROM uploads WHERE id = 5;")
                row = cursor.fetchone()
                if row:
                    matched_ref = row

            # 4. For U10: Similar Duplicate of U1 / U5
            if not matched_ref and u_id == 10:
                cursor.execute("SELECT id, user_id FROM uploads WHERE id = 1;")
                row = cursor.fetchone()
                if row:
                    matched_ref = row

            if matched_ref:
                ref_id, ref_user_id = matched_ref
                cursor.execute("SELECT name FROM users WHERE id = ?;", (ref_user_id,))
                user_row = cursor.fetchone()
                ref_user_name = user_row[0] if user_row else matched_stud or "Unknown"

                meta["matched_upload_id"] = ref_id
                new_meta_json = json.dumps(meta)

                cursor.execute("""
                    UPDATE uploads
                    SET metadata_json = ?, matched_student = COALESCE(matched_student, ?)
                    WHERE id = ?;
                """, (new_meta_json, ref_user_name, u_id))
                repaired_count += 1
                print(f"  [Repaired Upload {u_id}] Attached matched_upload_id={ref_id}, student='{ref_user_name}'")

    conn.commit()
    conn.close()
    print(f"[Migration v6] Complete! Repaired {repaired_count} historical upload reference(s).")

if __name__ == "__main__":
    migrate()
