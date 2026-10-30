import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metaguard.db# JWT Authentication")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Add parent_upload_id to uploads if not exists
upload_cols = [col[1] for col in cursor.execute("PRAGMA table_info(uploads)").fetchall()]
if "parent_upload_id" not in upload_cols:
    cursor.execute("ALTER TABLE uploads ADD COLUMN parent_upload_id INTEGER REFERENCES uploads(id)")
    print("Added parent_upload_id column to uploads.")
else:
    print("parent_upload_id already exists in uploads.")

# 2. Create notifications table if not exists
cursor.execute("""
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR DEFAULT 'info',
    link VARCHAR,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME
)
""")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id)")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications(is_read)")
print("Created notifications table and indexes.")

conn.commit()
conn.close()
print("Migration v9 completed successfully!")
