import sqlite3
import shutil
import os
from datetime import datetime

db_path = r'c:\Proj_T\meta-guard\backend\metaguard.db# JWT Authentication'
backup_path = f"{db_path}.backup_v10_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

print(f"Creating backup at {backup_path}...")
shutil.copyfile(db_path, backup_path)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

def get_columns(table_name):
    cursor.execute(f"PRAGMA table_info({table_name});")
    return [row[1] for row in cursor.fetchall()]

# 1. Update users table
user_cols = get_columns("users")
if "is_active" not in user_cols:
    print("Adding is_active to users table...")
    cursor.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1;")

if "is_deleted" not in user_cols:
    print("Adding is_deleted to users table...")
    cursor.execute("ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT 0;")

# 2. Update uploads table
upload_cols = get_columns("uploads")
if "is_deleted" not in upload_cols:
    print("Adding is_deleted to uploads table...")
    cursor.execute("ALTER TABLE uploads ADD COLUMN is_deleted BOOLEAN DEFAULT 0;")

if "similarity_status" not in upload_cols:
    print("Adding similarity_status to uploads table...")
    cursor.execute("ALTER TABLE uploads ADD COLUMN similarity_status VARCHAR DEFAULT 'Clean';")

# 3. Create audit_logs table
cursor.execute("""
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    admin_email VARCHAR,
    action_type VARCHAR NOT NULL,
    target_id VARCHAR,
    target_type VARCHAR,
    details JSON,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR,
    FOREIGN KEY(admin_id) REFERENCES users(id) ON DELETE SET NULL
);
""")

cursor.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_action_type ON audit_logs(action_type);")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_timestamp ON audit_logs(timestamp);")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_admin_id ON audit_logs(admin_id);")

conn.commit()
conn.close()

print("Migration v10 completed successfully!")
