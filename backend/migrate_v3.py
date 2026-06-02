import os
import hashlib
from database import SessionLocal
from sqlalchemy import text

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")

def get_exact_hash(file_path):
    hasher = hashlib.sha256()
    with open(file_path, 'rb') as f:
        buf = f.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = f.read(65536)
    return hasher.hexdigest()

def migrate():
    db = SessionLocal()

    try:
        db.execute(text("ALTER TABLE uploads ADD COLUMN file_path VARCHAR;"))
        db.commit()
        print("Added file_path column to uploads table.")
    except Exception as e:
        db.rollback()
        print(f"Column might already exist: {e}")

    # Backfill historical uploads
    if os.path.exists(UPLOAD_DIR):
        files = os.listdir(UPLOAD_DIR)
        for filename in files:
            path = os.path.join(UPLOAD_DIR, filename)
            # Use forward slashes for cross-platform compatibility if needed, but path is fine for now
            if os.path.isfile(path):
                file_hash = get_exact_hash(path)
                result = db.execute(
                    text("UPDATE uploads SET file_path = :path WHERE hash = :hash"), 
                    {"path": path, "hash": file_hash}
                )
                if result.rowcount > 0:
                    print(f"Linked historical file {filename} to {result.rowcount} records based on hash.")
    
    db.commit()
    db.close()
    print("Migration v3 complete.")

if __name__ == "__main__":
    migrate()
