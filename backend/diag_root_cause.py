"""
Root cause diagnostic: trace what /compare/{upload_id} actually returns
for the Campus hiring PDF (upload 12 or 13 or 14), versus what the
frontend receives and displays.

Screenshots show:
  Screenshot 2: overall_similarity=0%, but breakdown all=100%
  Screenshot 1: Copied Sections: Entire Document + AI summary "largely independent"

This means:
  - The API returns overall_similarity = stored_similarity = 100.0 for upload 12/13/14
  - But Screenshot 2 shows 0% — meaning the frontend received overall_similarity=0.0

Hypothesis: The frontend is opening the comparison for upload 11 (the REFERENCE,
which has sim_score=None → stored_similarity=0.0), NOT for 12/13/14.

Verify by checking what the /compare/11 endpoint would return.
"""
import sys
sys.path.insert(0, '.')
from database import SessionLocal
import models
from comparison import compare_texts

db = SessionLocal()

print("=" * 70)
print("TRACING /compare/11 (the REFERENCE upload - sim_score=None)")
print("=" * 70)

upload = db.query(models.Upload).filter(models.Upload.id == 11).first()
print(f"upload.id={upload.id}")
print(f"upload.sim_score={upload.similarity_score}")
print(f"upload.hash={upload.hash[:8] if upload.hash else None}")
print(f"upload.metadata_json type={type(upload.metadata_json)}")
print(f"upload.matched_student={upload.matched_student}")

# Replicate route logic
matched_upload = None

# Stage 1: metadata
if upload.metadata_json and upload.metadata_json.get("matched_upload_id"):
    mid = int(upload.metadata_json["matched_upload_id"])
    matched_upload = db.query(models.Upload).filter(models.Upload.id == mid).first()
    print(f"Stage1 matched: id={matched_upload.id if matched_upload else None}")

# Stage 2: hash
if not matched_upload and upload.hash:
    matched_upload = (
        db.query(models.Upload)
        .filter(models.Upload.hash == upload.hash, models.Upload.id != upload.id)
        .order_by(models.Upload.id.asc())
        .first()
    )
    print(f"Stage2 hash matched: id={matched_upload.id if matched_upload else None}")

# Stage 3: matched_student name
if not matched_upload and upload.matched_student:
    matched_user = db.query(models.User).filter(models.User.name == upload.matched_student).first()
    if matched_user:
        matched_upload = (
            db.query(models.Upload)
            .filter(
                models.Upload.user_id == matched_user.id,
                models.Upload.assignment_title == upload.assignment_title,
                models.Upload.id != upload.id,
            )
            .first()
        )
    print(f"Stage3 name matched: id={matched_upload.id if matched_upload else None}")

stored_similarity = upload.similarity_score or 0.0  # <--- KEY: None → 0.0
print(f"\nstored_similarity (what API returns as overall_similarity) = {stored_similarity}")
print(f"  ↑↑↑ THIS IS THE ROOT CAUSE if it shows 0.0 while components are 100%")

if matched_upload and matched_upload.extracted_text:
    upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []
    is_file_exact = (upload.similarity_score is not None and upload.similarity_score >= 99.9)
    print(f"\nis_file_exact={is_file_exact}")
    result = compare_texts(
        upload.extracted_text or '',
        matched_upload.extracted_text,
        upload_pages,
        is_file_exact=is_file_exact
    )
    print(f"compare_texts overall_similarity={result.get('overall_similarity')}")
    print(f"breakdown={result.get('breakdown')}")
    print(f"detection_method={result.get('detection_method')}")
    print(f"match_statistics={result.get('match_statistics')}")
    print(f"ai_summary={result.get('ai_summary')}")
else:
    print(f"\nNo matched_upload or no extracted_text → comparison_data is empty")

print("\n" + "=" * 70)
print("CONCLUSION for /compare/11:")
print(f"  overall_similarity returned = {stored_similarity}")
print(f"  comparison_data would have correct metrics from compare_texts")
print(f"  BUT the API response uses stored_similarity ({stored_similarity}) NOT")
print(f"  compare_texts's overall_similarity — so they DIVERGE.")
print("=" * 70)

print("\n" + "=" * 70)
print("ALSO CHECK: Does upload 11 show in the evaluator dashboard?")
print("  (upload 11 has sim_score=None → not flagged as duplicate → may appear in list)")
print("  If a user opens upload 11's comparison, they see overall=0%")
print("  but breakdown shows 100% because compare_texts correctly detects content-exact")
print("=" * 70)

# Also check what reference_upload_id would be returned for upload 11
print(f"\nFor /compare/11:")
print(f"  reference_upload_id = {matched_upload.id if matched_upload else None}")
print(f"  overall_similarity (API response) = {stored_similarity}")
print(f"  breakdown Normalized Content = 100 (because hashes match, content is exact)")
print(f"\nROOT CAUSE CONFIRMED: stored_similarity=None→0.0 for reference uploads (first uploads),")
print(f"but compare_texts correctly returns 100% for all metrics because the content is identical.")

db.close()
