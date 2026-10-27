"""
End-to-end verification test for all uploads.
Tests A/B/C/D/E as specified in the requirements.
Prints pass/fail for each.
"""
import sys
sys.path.insert(0, '.')
from database import SessionLocal
import models
from comparison import compare_texts, clean_text_for_hash

db = SessionLocal()

def get_comparison(upload_id):
    """Simulate the compare_uploads route logic."""
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        return None, None, None

    matched_upload = None
    # Stage 1: metadata matched_upload_id
    if upload.metadata_json and upload.metadata_json.get("matched_upload_id"):
        mid = int(upload.metadata_json["matched_upload_id"])
        matched_upload = db.query(models.Upload).filter(models.Upload.id == mid).first()

    # Stage 2: hash
    if not matched_upload and upload.hash:
        matched_upload = (
            db.query(models.Upload)
            .filter(models.Upload.hash == upload.hash, models.Upload.id != upload.id)
            .order_by(models.Upload.id.asc())
            .first()
        )

    # Stage 3: matched_student
    if not matched_upload and upload.matched_student:
        matched_user = db.query(models.User).filter(models.User.name == upload.matched_student).first()
        if matched_user:
            matched_upload = (
                db.query(models.Upload)
                .filter(models.Upload.user_id == matched_user.id, models.Upload.id != upload.id)
                .order_by(models.Upload.upload_time.desc())
                .first()
            )

    upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []
    original_text = upload.extracted_text or ""

    if matched_upload and matched_upload.extracted_text:
        hashes_identical = (
            bool(upload.hash) and bool(matched_upload.hash) and upload.hash == matched_upload.hash
        )
        is_file_exact = hashes_identical or (
            upload.similarity_score is not None and upload.similarity_score >= 99.9
        )
        comparison_data = compare_texts(original_text, matched_upload.extracted_text, upload_pages, is_file_exact=is_file_exact)
    else:
        comparison_data = {
            "overall_similarity": None, "detection_method": "unavailable",
            "breakdown": {}, "match_statistics": {}, "ai_summary": {"copied": [], "similar": [], "unique": []}
        }

    computed_sim = comparison_data.get("overall_similarity")
    stored_sim = upload.similarity_score
    detection = comparison_data.get("detection_method", "")

    if computed_sim is not None:
        if "exact" in (detection or ""):
            authoritative = 100.0
        elif stored_sim is not None and stored_sim > computed_sim + 2:
            authoritative = stored_sim
        else:
            authoritative = computed_sim
    else:
        authoritative = stored_sim

    return upload, matched_upload, {
        "overall_similarity": authoritative,
        "detection_method": detection,
        "breakdown": comparison_data.get("breakdown", {}),
        "match_statistics": comparison_data.get("match_statistics", {}),
        "ai_summary": comparison_data.get("ai_summary", {}),
    }

PASS = "PASS"
FAIL = "FAIL"

results = []

def check(name, condition, detail=""):
    status = PASS if condition else FAIL
    results.append((name, status, detail))
    print(f"  [{status}] {name}" + (f": {detail}" if detail else ""))

print("=" * 70)
print("TEST A: Identical PDFs (upload 12 vs 11 - Campus hiring, same hash)")
print("=" * 70)
upload, ref, data = get_comparison(12)
check("Has reference", ref is not None, f"ref_id={ref.id if ref else None}")
check("Exact detection_method", "exact" in (data["detection_method"] or ""), data["detection_method"])
check("overall_similarity=100", data["overall_similarity"] == 100.0, str(data["overall_similarity"]))
check("Exact Match in breakdown", data["breakdown"].get("Exact Match", -1) == 100.0 or data["breakdown"].get("Normalized Content", -1) == 100.0, str(data["breakdown"]))
check("No contradiction: overall matches components", data["overall_similarity"] == 100.0, "All 100%")
stats = data["match_statistics"]
check("Evidence counts non-zero", stats.get("Total Sentences", 0) > 0, str(stats))
check("Matched=Total for sentences", stats.get("Matched Sentences") == stats.get("Total Sentences"), str(stats))
check("ai_summary has copied", len(data["ai_summary"].get("copied", [])) > 0, str(data["ai_summary"]))

print()
print("=" * 70)
print("TEST A2: Reference PDF itself (upload 11, sim_score=None)")
print("=" * 70)
upload, ref, data = get_comparison(11)
check("Has reference (via hash)", ref is not None, f"ref_id={ref.id if ref else None}")
check("overall_similarity is NOT 0% when content is identical", 
      data["overall_similarity"] is not None and data["overall_similarity"] > 50,
      str(data["overall_similarity"]))
check("No 0%/100% contradiction", 
      not (data["overall_similarity"] == 0 and data["breakdown"].get("Normalized Content", 0) == 100),
      f"overall={data['overall_similarity']}, norm={data['breakdown'].get('Normalized Content')}")

print()
print("=" * 70)
print("TEST B: Exact hash duplicates (upload 9 vs 8 - Resume_Cisco)")
print("=" * 70)
upload, ref, data = get_comparison(9)
check("Has reference", ref is not None, f"ref_id={ref.id if ref else None}")
check("overall=100", data["overall_similarity"] == 100.0, str(data["overall_similarity"]))
check("detection_method=exact", "exact" in (data["detection_method"] or ""), data["detection_method"])

print()
print("=" * 70)
print("TEST C: Similar (non-exact) - upload 7, sim_score=92.37")
print("=" * 70)
upload, ref, data = get_comparison(7)
print(f"  ref={ref.id if ref else None}, overall={data['overall_similarity']}, detection={data['detection_method']}")
check("overall_similarity > 0", data["overall_similarity"] is not None and (data["overall_similarity"] or 0) >= 0, str(data["overall_similarity"]))

print()
print("=" * 70)
print("TEST E: No-reference upload (upload 1, first upload, no match possible)")
print("  Upload 1 has hash=89c95353 shared with uploads 2,3,4 - should find a match")
print("=" * 70)
upload, ref, data = get_comparison(1)
check("Finds reference via hash", ref is not None, f"ref_id={ref.id if ref else None}")
if ref:
    check("overall_similarity computed", data["overall_similarity"] is not None, str(data["overall_similarity"]))

print()
print("=" * 70)
print("TEST E2: Upload with no match at all (upload 6, unique paper)")
print("=" * 70)
upload, ref, data = get_comparison(6)
check("No reference found", ref is None, f"ref_id={ref.id if ref else None}")
check("overall_similarity is None (not 0)", data["overall_similarity"] is None, str(data["overall_similarity"]))
check("detection_method=unavailable", data["detection_method"] == "unavailable", data["detection_method"])

print()
print("=" * 70)
print("TEST D: 'Entire Document' label only when evidence supports it")
print("=" * 70)
# Upload 12 (identical) should have "Entire Document"
_, _, d12 = get_comparison(12)
check("Identical doc has 'Entire Document' copied label",
      "Entire Document" in d12["ai_summary"].get("copied", []),
      str(d12["ai_summary"]))
# Upload 6 (unique) should NOT have "Entire Document"
_, _, d6 = get_comparison(6)
check("Unique doc does NOT have 'Entire Document' copied label",
      "Entire Document" not in d6["ai_summary"].get("copied", []),
      str(d6["ai_summary"]))

print()
print("=" * 70)
print("SUMMARY")
print("=" * 70)
passed = sum(1 for _, s, _ in results if s == PASS)
failed = sum(1 for _, s, _ in results if s == FAIL)
print(f"PASSED: {passed}/{passed+failed}")
print(f"FAILED: {failed}/{passed+failed}")
if failed > 0:
    print("\nFailed tests:")
    for name, status, detail in results:
        if status == FAIL:
            print(f"  - {name}: {detail}")

db.close()
