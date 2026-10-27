"""
Patch routes.py: fix the compare_uploads endpoint to:
1. Use compare_texts result as authoritative overall_similarity (not stored_similarity which is None for reference uploads)
2. Return detection_method from comparison_data
3. Fix is_file_exact to use hash comparison (not just sim_score, which is None for reference uploads)
"""
import sys
import re

path = r"C:\Proj_T\meta-guard\backend\routes.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Find and replace the entire block from "# -- Use STORED" to end of return statement
old_block = '''    # \u2500\u2500 Use STORED similarity score as the authoritative score \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    # This guarantees the modal displays the same value as the evaluator dashboard.
    stored_similarity = upload.similarity_score or 0.0

    original_text = upload.extracted_text or ""
    upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []

    # Only run the content comparison when we have a real reference document with text.
    if matched_upload and matched_upload.extracted_text:
        matched_text = matched_upload.extracted_text
        comparison_data = compare_texts(
            original_text, matched_text, upload_pages,
            is_file_exact=(upload.similarity_score is not None and upload.similarity_score >= 99.9)
        )
    else:
        # No reference available \u2014 return empty comparison instead of bogus data
        comparison_data = {
            "uploaded_highlighted": [],
            "matched_highlighted": [],
            "ai_summary": {"copied": [], "similar": [], "unique": []},
            "page_heatmap": [],
            "breakdown": {},
            "match_statistics": {}
        }
    
    return {
        "upload_id": upload.id,
        "reference_upload_id": matched_upload.id if matched_upload else None,
        
        "uploaded_document": {
            "id": upload.id,
            "file_name": upload.file_name,
            "section_name": upload.section_name,
            "assignment_title": upload.assignment_title,
            "upload_time": upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if upload.upload_time else "Unknown"
        },
        
        "reference_document": {
            "id": matched_upload.id if matched_upload else None,
            "file_name": matched_upload.file_name if matched_upload else None,
            "matched_student": (
                matched_upload.owner.name
                if matched_upload and matched_upload.owner
                else (upload.matched_student or None)
            ),
            "upload_time": (
                matched_upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST")
                if matched_upload and matched_upload.upload_time else None
            )
        },
        
        # Authoritative score = stored value (same as evaluator dashboard list)
        "overall_similarity": stored_similarity,
        "duplicate_type": upload.duplicate_type,
        
        "uploaded_highlighted": comparison_data["uploaded_highlighted"],
        "matched_highlighted": comparison_data["matched_highlighted"],
        "ai_summary": comparison_data.get("ai_summary", {}),
        "page_heatmap": comparison_data.get("page_heatmap", []),
        "breakdown": comparison_data.get("breakdown", {}),
        "match_statistics": comparison_data.get("match_statistics", {})
    }'''

new_block = '''    original_text = upload.extracted_text or ""
    upload_pages = upload.metadata_json.get("pages_text", []) if isinstance(upload.metadata_json, dict) else []

    # \u2500\u2500 Run content comparison when a reference is available \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    if matched_upload and matched_upload.extracted_text:
        matched_text = matched_upload.extracted_text

        # is_file_exact: True when binary SHA-256 hashes are identical.
        # Must also check matched_upload.hash, because the upload might be the
        # first/reference upload (sim_score=None) but files are binary-identical.
        hashes_identical = (
            bool(upload.hash)
            and bool(matched_upload.hash)
            and upload.hash == matched_upload.hash
        )
        is_file_exact = hashes_identical or (
            upload.similarity_score is not None and upload.similarity_score >= 99.9
        )

        comparison_data = compare_texts(
            original_text, matched_text, upload_pages,
            is_file_exact=is_file_exact
        )
    else:
        # No reference available \u2014 return empty comparison with explicit unavailable state
        comparison_data = {
            "uploaded_highlighted": [],
            "matched_highlighted": [],
            "ai_summary": {"copied": [], "similar": [], "unique": []},
            "page_heatmap": [],
            "breakdown": {},
            "match_statistics": {},
            "overall_similarity": None,
            "detection_method": "unavailable",
        }

    # \u2500\u2500 Single authoritative overall_similarity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    # Use compare_texts result as truth when comparison ran (fixes the
    # "0% overall but 100% components" bug for reference/first uploads whose
    # stored sim_score is None).
    # Fall back to stored score only when no comparison was possible.
    computed_similarity = comparison_data.get("overall_similarity")
    stored_similarity = upload.similarity_score  # may be None

    if computed_similarity is not None:
        # Comparison ran successfully.
        detection_method = comparison_data.get("detection_method", "")
        if "exact" in (detection_method or ""):
            # Exact content/hash match is definitive: always 100%.
            authoritative_similarity = 100.0
        elif stored_similarity is not None and stored_similarity > computed_similarity + 2:
            # Stored score was validated at upload time with the full engine;
            # if it's significantly higher, prefer it (avoids regression for
            # existing records).
            authoritative_similarity = stored_similarity
        else:
            authoritative_similarity = computed_similarity
    else:
        # No comparison ran \u2014 use stored score (may still be None for reference uploads).
        authoritative_similarity = stored_similarity

    return {
        "upload_id": upload.id,
        "reference_upload_id": matched_upload.id if matched_upload else None,

        "uploaded_document": {
            "id": upload.id,
            "file_name": upload.file_name,
            "section_name": upload.section_name,
            "assignment_title": upload.assignment_title,
            "upload_time": upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST") if upload.upload_time else "Unknown"
        },

        "reference_document": {
            "id": matched_upload.id if matched_upload else None,
            "file_name": matched_upload.file_name if matched_upload else None,
            "matched_student": (
                matched_upload.owner.name
                if matched_upload and matched_upload.owner
                else (upload.matched_student or None)
            ),
            "upload_time": (
                matched_upload.upload_time.strftime("%d-%m-%Y | %I:%M %p IST")
                if matched_upload and matched_upload.upload_time else None
            )
        },

        # Single authoritative score derived from compare_texts (or stored fallback).
        # Never collapses None to 0 for reference uploads.
        "overall_similarity": authoritative_similarity,
        "duplicate_type": upload.duplicate_type,
        "detection_method": comparison_data.get("detection_method"),

        "uploaded_highlighted": comparison_data["uploaded_highlighted"],
        "matched_highlighted": comparison_data["matched_highlighted"],
        "ai_summary": comparison_data.get("ai_summary", {}),
        "page_heatmap": comparison_data.get("page_heatmap", []),
        "breakdown": comparison_data.get("breakdown", {}),
        "match_statistics": comparison_data.get("match_statistics", {}),
    }'''

if old_block in content:
    content = content.replace(old_block, new_block, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("PATCHED routes.py successfully")
else:
    # Try normalizing CRLF
    old_crlf = old_block.replace("\n", "\r\n")
    if old_crlf in content:
        content = content.replace(old_crlf, new_block, 1)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print("PATCHED routes.py (CRLF version) successfully")
    else:
        print("ERROR: Could not find target block")
        # Show what's around line 1244
        lines = content.splitlines()
        for i, line in enumerate(lines[1240:1260], start=1241):
            print(f"{i}: {repr(line)}")
