"""Diagnostic script – inspect upload DB records."""
import sys
sys.path.insert(0, '.')
from database import SessionLocal
import models

db = SessionLocal()
uploads = db.query(models.Upload).order_by(models.Upload.id).all()
for u in uploads:
    mj = u.metadata_json or {}
    mid = mj.get('matched_upload_id') if isinstance(mj, dict) else None
    txt_len = len(u.extracted_text or '')
    pages = len(mj.get('pages_text', [])) if isinstance(mj, dict) else 0
    print(
        f"ID={u.id} sim={u.similarity_score} dup={u.duplicate_type} "
        f"matched_student={u.matched_student!r} matched_uid={mid} "
        f"hash={u.hash[:8] if u.hash else None} txt={txt_len} pages={pages} "
        f"file={repr((u.file_name or '')[:50])}"
    )
print("\n--- Hash groups ---")
from collections import defaultdict
by_hash = defaultdict(list)
for u in uploads:
    if u.hash:
        by_hash[u.hash].append(u.id)
for h, ids in by_hash.items():
    if len(ids) > 1:
        print(f"  hash {h[:8]}... shared by upload IDs: {ids}")
db.close()
