"""
Trace every upload's compare result to find the 0% overall / 100% metrics contradiction.
Also traces uploads 9, 13, 14, 17 (Exact Duplicates with matched_uid in metadata).
"""
import sys
sys.path.insert(0, '.')
from database import SessionLocal
import models
from comparison import compare_texts

db = SessionLocal()

# Check all uploads that have similarity_score set and matched upload
for uid in [2, 3, 4, 7, 9, 10, 12, 13, 14, 17]:
    upload = db.query(models.Upload).filter(models.Upload.id == uid).first()
    if not upload:
        continue

    mj = upload.metadata_json or {}

    # Replicate current compare logic
    matched_upload = None

    # Stage 1: metadata
    if isinstance(mj, dict) and mj.get("matched_upload_id"):
        mid = int(mj["matched_upload_id"])
        matched_upload = db.query(models.Upload).filter(models.Upload.id == mid).first()

    # Stage 2: hash
    if not matched_upload and upload.hash:
        matched_upload = db.query(models.Upload).filter(
            models.Upload.hash == upload.hash,
            models.Upload.id != upload.id
        ).order_by(models.Upload.id.asc()).first()

    # Stage 3: name
    if not matched_upload and upload.matched_student:
        matched_user = db.query(models.User).filter(models.User.name == upload.matched_student).first()
        if matched_user:
            matched_upload = db.query(models.Upload).filter(
                models.Upload.user_id == matched_user.id,
                models.Upload.id != upload.id,
            ).order_by(models.Upload.upload_time.desc()).first()

    stored_sim = upload.similarity_score or 0.0
    is_file_exact = upload.similarity_score is not None and upload.similarity_score >= 99.9

    if matched_upload and matched_upload.extracted_text:
        up_pages = mj.get("pages_text", []) if isinstance(mj, dict) else []
        result = compare_texts(upload.extracted_text or '', matched_upload.extracted_text, up_pages, is_file_exact=is_file_exact)
        comp_overall = result.get('overall_similarity', 0)
        breakdown = result.get('breakdown', {})
    else:
        comp_overall = None
        breakdown = {}

    consistent = (stored_sim == comp_overall) if comp_overall is not None else None
    issue = ""
    if comp_overall is not None and abs(stored_sim - comp_overall) > 2:
        issue = " *** INCONSISTENCY ***"
    # Check contradiction: 0% overall but non-zero metrics
    if stored_sim == 0 and breakdown:
        non_zero = {k: v for k, v in breakdown.items() if v and v > 0}
        if non_zero:
            issue = " *** 0% OVERALL BUT NON-ZERO METRICS ***"

    ref_id = matched_upload.id if matched_upload else None
    print(f"Upload {uid}: stored={stored_sim}%, computed={comp_overall}%, ref={ref_id}, is_exact={is_file_exact}, consistent={consistent}{issue}")
    if issue:
        print(f"  breakdown={breakdown}")
        print(f"  stats={result.get('match_statistics', {}) if matched_upload else {}}")

db.close()
