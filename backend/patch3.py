"""Patch routes.py: replace lines 1244-1305 (0-indexed 1243-1304) with new implementation."""
path = r"C:\Proj_T\meta-guard\backend\routes.py"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# 0-indexed lines 1243 to 1304 inclusive (1-indexed 1244 to 1305)
start_idx = 1243
end_idx = 1305  # exclusive in slice

# Verify we have the right region
assert "Use STORED similarity score" in lines[start_idx], f"Wrong line: {repr(lines[start_idx])}"

new_lines = [
    "    original_text = upload.extracted_text or \"\"\n",
    "    upload_pages = upload.metadata_json.get(\"pages_text\", []) if isinstance(upload.metadata_json, dict) else []\n",
    "\n",
    "    # Run content comparison when a reference is available\n",
    "    if matched_upload and matched_upload.extracted_text:\n",
    "        matched_text = matched_upload.extracted_text\n",
    "\n",
    "        # is_file_exact: True when binary SHA-256 hashes are identical.\n",
    "        # Must also check matched_upload.hash, because the upload might be the\n",
    "        # first/reference upload (sim_score=None) but files are binary-identical.\n",
    "        hashes_identical = (\n",
    "            bool(upload.hash)\n",
    "            and bool(matched_upload.hash)\n",
    "            and upload.hash == matched_upload.hash\n",
    "        )\n",
    "        is_file_exact = hashes_identical or (\n",
    "            upload.similarity_score is not None and upload.similarity_score >= 99.9\n",
    "        )\n",
    "\n",
    "        comparison_data = compare_texts(\n",
    "            original_text, matched_text, upload_pages,\n",
    "            is_file_exact=is_file_exact\n",
    "        )\n",
    "    else:\n",
    "        # No reference available - return empty comparison with explicit unavailable state\n",
    "        comparison_data = {\n",
    "            \"uploaded_highlighted\": [],\n",
    "            \"matched_highlighted\": [],\n",
    "            \"ai_summary\": {\"copied\": [], \"similar\": [], \"unique\": []},\n",
    "            \"page_heatmap\": [],\n",
    "            \"breakdown\": {},\n",
    "            \"match_statistics\": {},\n",
    "            \"overall_similarity\": None,\n",
    "            \"detection_method\": \"unavailable\",\n",
    "        }\n",
    "\n",
    "    # Single authoritative overall_similarity.\n",
    "    # Use compare_texts result as truth when comparison ran.\n",
    "    # This fixes the '0% overall but 100% components' bug for reference/first\n",
    "    # uploads whose stored sim_score is None (None or 0.0 bug).\n",
    "    computed_similarity = comparison_data.get(\"overall_similarity\")\n",
    "    stored_similarity = upload.similarity_score  # may be None for first uploads\n",
    "\n",
    "    if computed_similarity is not None:\n",
    "        detection_method = comparison_data.get(\"detection_method\", \"\")\n",
    "        if \"exact\" in (detection_method or \"\"):\n",
    "            # Exact content/hash match is definitive: always 100%.\n",
    "            authoritative_similarity = 100.0\n",
    "        elif stored_similarity is not None and stored_similarity > computed_similarity + 2:\n",
    "            # Stored score was validated at upload time; if significantly higher,\n",
    "            # prefer it to avoid regression for existing records.\n",
    "            authoritative_similarity = stored_similarity\n",
    "        else:\n",
    "            authoritative_similarity = computed_similarity\n",
    "    else:\n",
    "        # No comparison ran - use stored score (may still be None for reference uploads).\n",
    "        authoritative_similarity = stored_similarity\n",
    "\n",
    "    return {\n",
    "        \"upload_id\": upload.id,\n",
    "        \"reference_upload_id\": matched_upload.id if matched_upload else None,\n",
    "\n",
    "        \"uploaded_document\": {\n",
    "            \"id\": upload.id,\n",
    "            \"file_name\": upload.file_name,\n",
    "            \"section_name\": upload.section_name,\n",
    "            \"assignment_title\": upload.assignment_title,\n",
    "            \"upload_time\": upload.upload_time.strftime(\"%d-%m-%Y | %I:%M %p IST\") if upload.upload_time else \"Unknown\"\n",
    "        },\n",
    "\n",
    "        \"reference_document\": {\n",
    "            \"id\": matched_upload.id if matched_upload else None,\n",
    "            \"file_name\": matched_upload.file_name if matched_upload else None,\n",
    "            \"matched_student\": (\n",
    "                matched_upload.owner.name\n",
    "                if matched_upload and matched_upload.owner\n",
    "                else (upload.matched_student or None)\n",
    "            ),\n",
    "            \"upload_time\": (\n",
    "                matched_upload.upload_time.strftime(\"%d-%m-%Y | %I:%M %p IST\")\n",
    "                if matched_upload and matched_upload.upload_time else None\n",
    "            )\n",
    "        },\n",
    "\n",
    "        # Single authoritative score. Never collapses None to 0 for reference uploads.\n",
    "        \"overall_similarity\": authoritative_similarity,\n",
    "        \"duplicate_type\": upload.duplicate_type,\n",
    "        \"detection_method\": comparison_data.get(\"detection_method\"),\n",
    "\n",
    "        \"uploaded_highlighted\": comparison_data[\"uploaded_highlighted\"],\n",
    "        \"matched_highlighted\": comparison_data[\"matched_highlighted\"],\n",
    "        \"ai_summary\": comparison_data.get(\"ai_summary\", {}),\n",
    "        \"page_heatmap\": comparison_data.get(\"page_heatmap\", []),\n",
    "        \"breakdown\": comparison_data.get(\"breakdown\", {}),\n",
    "        \"match_statistics\": comparison_data.get(\"match_statistics\", {}),\n",
    "    }\n",
]

new_content = lines[:start_idx] + new_lines + lines[end_idx:]

with open(path, "w", encoding="utf-8") as f:
    f.writelines(new_content)

print(f"Patched: replaced {end_idx - start_idx} lines with {len(new_lines)} lines")
print(f"Total lines now: {len(new_content)}")
