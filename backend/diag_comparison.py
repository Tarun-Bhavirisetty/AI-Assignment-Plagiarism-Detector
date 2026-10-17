"""
Trace the comparison for upload ID 12 (exact duplicate of upload ID 11).
This is the Campus hiring PDF pair shown in the screenshots.
"""
import sys
sys.path.insert(0, '.')
from database import SessionLocal
import models
from comparison import compare_texts, clean_text_for_hash, split_into_sentences, split_into_paragraphs

db = SessionLocal()

# Fetch the two uploads
up12 = db.query(models.Upload).filter(models.Upload.id == 12).first()
up11 = db.query(models.Upload).filter(models.Upload.id == 11).first()

print("=== Upload 12 (submitted) ===")
print(f"  sim_score={up12.similarity_score}, dup_type={up12.duplicate_type}")
print(f"  matched_uid in meta={up12.metadata_json.get('matched_upload_id') if isinstance(up12.metadata_json, dict) else 'N/A'}")
print(f"  hash={up12.hash}")
print(f"  extracted_text len={len(up12.extracted_text or '')}")
pages12 = up12.metadata_json.get('pages_text', []) if isinstance(up12.metadata_json, dict) else []
print(f"  pages_text count={len(pages12)}")

print("\n=== Upload 11 (reference) ===")
print(f"  sim_score={up11.similarity_score}, dup_type={up11.duplicate_type}")
print(f"  hash={up11.hash}")
print(f"  extracted_text len={len(up11.extracted_text or '')}")
pages11 = up11.metadata_json.get('pages_text', []) if isinstance(up11.metadata_json, dict) else []
print(f"  pages_text count={len(pages11)}")

print("\n=== Normalization check ===")
norm12 = clean_text_for_hash(up12.extracted_text or '')
norm11 = clean_text_for_hash(up11.extracted_text or '')
print(f"  norm12 len={len(norm12)}, norm11 len={len(norm11)}")
print(f"  norm12 == norm11: {norm12 == norm11}")
print(f"  hash12 == hash11: {up12.hash == up11.hash}")

print("\n=== is_file_exact flag in compare endpoint ===")
# The compare endpoint now uses: is_file_exact=(upload.similarity_score is not None and upload.similarity_score >= 99.9)
print(f"  sim_score={up12.similarity_score}  =>  is_file_exact={up12.similarity_score is not None and up12.similarity_score >= 99.9}")

print("\n=== Sentences / Paragraphs ===")
sents = split_into_sentences(up12.extracted_text or '')
paras = split_into_paragraphs(up12.extracted_text or '')
print(f"  uploaded sentences={len(sents)}, paragraphs={len(paras)}")

ref_sents = split_into_sentences(up11.extracted_text or '')
ref_paras = split_into_paragraphs(up11.extracted_text or '')
print(f"  reference sentences={len(ref_sents)}, paragraphs={len(ref_paras)}")

print("\n=== compare_texts result (with is_file_exact=True, since hash matches) ===")
result = compare_texts(up12.extracted_text or '', up11.extracted_text or '', pages12, is_file_exact=True)
print(f"  overall_similarity={result.get('overall_similarity')}")
print(f"  breakdown={result.get('breakdown')}")
print(f"  match_statistics={result.get('match_statistics')}")
print(f"  ai_summary={result.get('ai_summary')}")
print(f"  page_heatmap={result.get('page_heatmap')}")
print(f"  detection_method={result.get('detection_method')}")

print("\n=== compare_texts result (with is_file_exact=False, to simulate the bug) ===")
result2 = compare_texts(up12.extracted_text or '', up11.extracted_text or '', pages12, is_file_exact=False)
print(f"  overall_similarity={result2.get('overall_similarity')}")
print(f"  breakdown={result2.get('breakdown')}")
print(f"  match_statistics={result2.get('match_statistics')}")
print(f"  ai_summary={result2.get('ai_summary')}")

db.close()
