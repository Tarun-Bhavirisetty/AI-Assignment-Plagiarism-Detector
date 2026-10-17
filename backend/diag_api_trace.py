"""
Full trace of what /compare/{upload_id} currently returns for upload 12.
Simulates the exact route handler logic.
"""
import sys
sys.path.insert(0, '.')
from database import SessionLocal
import models
from comparison import compare_texts

db = SessionLocal()

upload_id = 12
upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()

print(f"Upload ID={upload.id}, sim_score={upload.similarity_score}, hash={upload.hash[:8]}")

# Stage 1: metadata matched_upload_id
matched_upload = None
if upload.metadata_json and upload.metadata_json.get("matched_upload_id"):
    mid = int(upload.metadata_json["matched_upload_id"])
    matched_upload = db.query(models.Upload).filter(models.Upload.id == mid).first()
    print(f"Stage 1: found matched_upload ID={matched_upload.id if matched_upload else None}")

# Stage 2: hash
if not matched_upload and upload.hash:
    matched_upload = db.query(models.Upload).filter(
        models.Upload.hash == upload.hash,
        models.Upload.id != upload.id
    ).order_by(models.Upload.id.asc()).first()
    print(f"Stage 2: found matched_upload ID={matched_upload.id if matched_upload else None}")

print(f"\nmatched_upload ID={matched_upload.id if matched_upload else None}")
print(f"matched_upload.extracted_text len={len(matched_upload.extracted_text or '') if matched_upload else 0}")

# stored_similarity
stored_similarity = upload.similarity_score or 0.0
print(f"\nstored_similarity (= overall_similarity returned)={stored_similarity}")

# compare call
original_text = upload.extracted_text or ""
upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []

is_file_exact = (upload.similarity_score is not None and upload.similarity_score >= 99.9)
print(f"is_file_exact={is_file_exact}")

if matched_upload and matched_upload.extracted_text:
    matched_text = matched_upload.extracted_text
    comparison_data = compare_texts(original_text, matched_text, upload_pages, is_file_exact=is_file_exact)
else:
    comparison_data = {"uploaded_highlighted":[], "matched_highlighted":[], "ai_summary":{"copied":[], "similar":[], "unique":[]}, "page_heatmap":[], "breakdown":{}, "match_statistics":{}}

print(f"\n=== Final API response fields ===")
print(f"overall_similarity (stored) = {stored_similarity}")
print(f"comparison_data overall_similarity (NOT returned in API) = {comparison_data.get('overall_similarity')}")
print(f"breakdown = {comparison_data.get('breakdown')}")
print(f"match_statistics = {comparison_data.get('match_statistics')}")
print(f"ai_summary = {comparison_data.get('ai_summary')}")
print(f"page_heatmap count = {len(comparison_data.get('page_heatmap', []))}")

print("\n=== DIAGNOSIS ===")
print(f"The API returns overall_similarity = {stored_similarity} (stored, correct)")
print(f"The breakdown and match_statistics come from compare_texts which returns overall_similarity={comparison_data.get('overall_similarity')}")
print(f"So overall_similarity in the frontend = {stored_similarity} (stored)")
print(f"But breakdown metrics show {comparison_data.get('breakdown')}")

db.close()
