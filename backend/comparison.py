import re
from typing import List, Dict, Any, Tuple
import numpy as np
from ai.similarity_engine import similarity_engine


def clean_text_for_hash(text: str) -> str:
    if not text:
        return ""
    return re.sub(r'\s+', '', text.lower())


def split_into_sentences(text: str) -> List[str]:
    """Basic sentence splitting using regex. Ignores tiny fragments."""
    if not text:
        return []
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if len(s.strip()) > 10]


def split_into_paragraphs(text: str) -> List[str]:
    if not text:
        return []
    paragraphs = text.split('\n\n')
    return [p.strip() for p in paragraphs if len(p.strip()) > 20]


def _normalized_content_similarity(text_a: str, text_b: str) -> float:
    """Compute character-level Jaccard similarity on whitespace-normalized text."""
    if not text_a or not text_b:
        return 0.0
    na = clean_text_for_hash(text_a)
    nb = clean_text_for_hash(text_b)
    if na == nb:
        return 100.0
    if not na or not nb:
        return 0.0
    # Character 4-gram overlap (fast and robust)
    def ngrams(s, n=4):
        return set(s[i:i+n] for i in range(len(s) - n + 1))
    ga, gb = ngrams(na), ngrams(nb)
    if not ga or not gb:
        return 0.0
    intersection = len(ga & gb)
    union = len(ga | gb)
    return round((intersection / union) * 100.0, 2) if union else 0.0


def find_page_for_sentence(sentence: str, pages: List[str]) -> int:
    """Identify which 1-based page index contains the given sentence."""
    if not pages or not sentence:
        return 1
    clean_s = " ".join(sentence.split()).lower()
    for idx, p in enumerate(pages):
        clean_p = " ".join(p.split()).lower()
        if clean_s in clean_p:
            return idx + 1
        # Fallback: check first 4 words
        words = clean_s.split()
        if len(words) >= 4 and " ".join(words[:4]) in clean_p:
            return idx + 1
    return 1


def compare_texts(
    uploaded_text: str,
    matched_text: str,
    upload_pages: List[str] = None,
    matched_pages: List[str] = None,
    is_file_exact: bool = False,
) -> Dict[str, Any]:
    """
    Compare two texts at full-document, paragraph, and sentence levels.

    is_file_exact = True  means binary SHA-256 hashes are identical.
    is_content_exact      is detected internally from normalized text.

    Returns a dict with overall_similarity, breakdown, match_statistics,
    uploaded_highlighted, matched_highlighted, ai_summary, page_heatmap,
    detection_method, and structured evidence_records.
    """
    if not uploaded_text or not matched_text:
        return {
            "uploaded_highlighted": [],
            "matched_highlighted": [],
            "breakdown": {},
            "match_statistics": {},
            "ai_summary": {"copied": [], "similar": [], "unique": []},
            "page_heatmap": [],
            "evidence_records": [],
            "overall_similarity": 0.0,
            "detection_method": "unavailable",
        }

    norm_up = clean_text_for_hash(uploaded_text)
    norm_match = clean_text_for_hash(matched_text)
    is_content_exact = norm_up == norm_match and len(norm_up) > 0

    uploaded_sentences = split_into_sentences(uploaded_text)
    matched_sentences = split_into_sentences(matched_text)
    uploaded_paragraphs = split_into_paragraphs(uploaded_text)
    matched_paragraphs = split_into_paragraphs(matched_text)

    # ── Exact / content-identical fast path ─────────────────────────────────
    if is_file_exact or is_content_exact:
        uploaded_highlighted = [
            {"text": s, "color": "red", "score": 1.0} for s in uploaded_sentences
        ]
        matched_highlighted = [
            {"text": s, "color": "red", "score": 1.0} for s in matched_sentences
        ]

        evidence_records = []
        for i, s in enumerate(uploaded_sentences):
            up_page = find_page_for_sentence(s, upload_pages)
            ref_sent = matched_sentences[i] if i < len(matched_sentences) else s
            ref_page = find_page_for_sentence(ref_sent, matched_pages) if matched_pages else up_page
            start_off = uploaded_text.find(s)
            end_off = start_off + len(s) if start_off >= 0 else -1

            # Find paragraph index
            para_idx = 0
            for p_i, p in enumerate(uploaded_paragraphs):
                if s in p:
                    para_idx = p_i
                    break

            evidence_records.append({
                "id": i + 1,
                "matched_sentence": s,
                "reference_sentence": ref_sent,
                "uploaded_page": up_page,
                "reference_page": ref_page,
                "start_offset": start_off,
                "end_offset": end_off,
                "ref_start_offset": matched_text.find(ref_sent) if ref_sent else -1,
                "ref_end_offset": (matched_text.find(ref_sent) + len(ref_sent)) if ref_sent and matched_text.find(ref_sent) >= 0 else -1,
                "sentence_index": i,
                "paragraph_index": para_idx,
                "match_type": "exact",
                "score": 1.0,
                "color": "red",
                "location_status": "mapped"
            })

        page_heatmap = []
        if upload_pages:
            for idx, _ in enumerate(upload_pages):
                page_heatmap.append({"page": idx + 1, "similarity": 100.0})

        return {
            "uploaded_highlighted": uploaded_highlighted,
            "matched_highlighted": matched_highlighted,
            "evidence_records": evidence_records,
            "ai_summary": {
                "copied": ["Entire Document"],
                "similar": [],
                "unique": [],
            },
            "page_heatmap": page_heatmap,
            "detection_method": "exact_hash" if is_file_exact else "exact_content",
            "overall_similarity": 100.0,
            "breakdown": {
                "Exact Match": 100.0 if is_file_exact else 0.0,
                "Normalized Content": 100.0 if is_content_exact else 0.0,
                "Lexical Similarity": 100.0,
                "Semantic Similarity": 100.0,
                "Sentence Similarity": 100.0,
                "Paragraph Similarity": 100.0,
            },
            "match_statistics": {
                "Total Pages": len(upload_pages) if upload_pages else 1,
                "Matched Pages": len(upload_pages) if upload_pages else 1,
                "Total Sentences": len(uploaded_sentences),
                "Matched Sentences": len(uploaded_sentences),
                "Total Paragraphs": len(uploaded_paragraphs),
                "Matched Paragraphs": len(uploaded_paragraphs),
            },
        }

    # ── Multi-layer comparison ───────────────────────────────────────────────
    sentence_scores, detection_method = similarity_engine.compute_hybrid_sentence_scores(
        uploaded_sentences, matched_sentences
    )
    paragraph_scores, _ = similarity_engine.compute_hybrid_sentence_scores(
        uploaded_paragraphs, matched_paragraphs
    )

    # Build uploaded highlights, evidence records, and collect per-sentence best scores
    matched_sentences_count = 0
    uploaded_highlighted = []
    evidence_records = []
    sentence_sim_total = 0.0
    sentence_score_map: Dict[str, float] = {}

    for i, sent in enumerate(uploaded_sentences):
        if sentence_scores.size > 0:
            row = sentence_scores[i] if sentence_scores.ndim == 2 else sentence_scores
            best_idx = int(row.argmax()) if hasattr(row, 'argmax') else 0
            best_score = float(row.max())
            best_ref_sent = matched_sentences[best_idx] if best_idx < len(matched_sentences) else ""
        else:
            best_score = 0.0
            best_ref_sent = ""

        color = "green"
        match_type = "unique"
        if best_score >= 0.90:
            color = "red"
            match_type = "exact" if best_score >= 0.95 else "semantic"
            matched_sentences_count += 1
        elif best_score >= 0.60:
            color = "yellow"
            match_type = "paraphrased"
            matched_sentences_count += 1
        elif best_score >= 0.40:
            color = "orange"
            match_type = "lexical"

        sentence_sim_total += best_score
        uploaded_highlighted.append({"text": sent, "color": color, "score": best_score})
        sentence_score_map[sent] = best_score

        # If it's a flagged matching sentence (red, yellow, orange), build an evidence record
        if color in ["red", "yellow", "orange"]:
            up_page = find_page_for_sentence(sent, upload_pages)
            ref_page = find_page_for_sentence(best_ref_sent, matched_pages) if matched_pages else up_page
            start_off = uploaded_text.find(sent)
            end_off = start_off + len(sent) if start_off >= 0 else -1

            para_idx = 0
            for p_i, p in enumerate(uploaded_paragraphs):
                if sent in p:
                    para_idx = p_i
                    break

            evidence_records.append({
                "id": len(evidence_records) + 1,
                "matched_sentence": sent,
                "reference_sentence": best_ref_sent,
                "uploaded_page": up_page,
                "reference_page": ref_page,
                "start_offset": start_off,
                "end_offset": end_off,
                "ref_start_offset": matched_text.find(best_ref_sent) if best_ref_sent else -1,
                "ref_end_offset": (matched_text.find(best_ref_sent) + len(best_ref_sent)) if best_ref_sent and matched_text.find(best_ref_sent) >= 0 else -1,
                "sentence_index": i,
                "paragraph_index": para_idx,
                "match_type": match_type,
                "score": best_score,
                "color": color,
                "location_status": "mapped"
            })

    # Build matched highlights
    matched_highlighted = []
    for j, sent in enumerate(matched_sentences):
        if sentence_scores.size > 0 and sentence_scores.ndim == 2:
            best_score = float(sentence_scores[:, j].max())
        else:
            best_score = 0.0

        color = "green"
        if best_score >= 0.90:
            color = "red"
        elif best_score >= 0.60:
            color = "yellow"
        elif best_score >= 0.40:
            color = "orange"
        matched_highlighted.append({"text": sent, "color": color, "score": best_score})

    # Paragraph stats
    matched_paragraphs_count = 0
    paragraph_sim_total = 0.0
    for i in range(len(uploaded_paragraphs)):
        if paragraph_scores.size > 0:
            row = paragraph_scores[i] if paragraph_scores.ndim == 2 else paragraph_scores
            best_score = float(row.max())
        else:
            best_score = 0.0
        paragraph_sim_total += best_score
        if best_score >= 0.60:
            matched_paragraphs_count += 1

    sentence_similarity = (
        (sentence_sim_total / len(uploaded_sentences)) * 100
        if uploaded_sentences
        else 0.0
    )
    paragraph_similarity = (
        (paragraph_sim_total / len(uploaded_paragraphs)) * 100
        if uploaded_paragraphs
        else 0.0
    )

    # Lexical / semantic breakdown estimates
    is_hybrid = detection_method.startswith("hybrid")
    lexical_sim = sentence_similarity * 0.9 if is_hybrid else sentence_similarity
    semantic_sim = min(100.0, sentence_similarity * 1.1) if is_hybrid else -1.0

    # Normalized content similarity (actual 4-gram character overlap)
    normalized_content_sim = _normalized_content_similarity(uploaded_text, matched_text)

    # ── Overall similarity aggregation ────────────────────────────────────────
    if semantic_sim >= 0:
        overall_similarity = (
            sentence_similarity * 0.40
            + paragraph_similarity * 0.35
            + normalized_content_sim * 0.15
            + lexical_sim * 0.05
            + semantic_sim * 0.05
        )
    else:
        overall_similarity = (
            sentence_similarity * 0.45
            + paragraph_similarity * 0.40
            + normalized_content_sim * 0.15
        )
    overall_similarity = round(min(100.0, max(0.0, overall_similarity)), 2)

    # Safety guard: if all component metrics agree on near-100%, don't report 0%.
    component_avg = (
        (sentence_similarity + paragraph_similarity + normalized_content_sim) / 3
    )
    if overall_similarity < 1.0 and component_avg > 50.0:
        overall_similarity = round(component_avg, 2)

    # ── Page heatmap ──────────────────────────────────────────────────────────
    page_heatmap = []
    matched_pages_count = 0
    if upload_pages:
        for idx, page_text in enumerate(upload_pages):
            page_sents = split_into_sentences(page_text)
            scores = []
            for ps in page_sents:
                score = sentence_score_map.get(ps)
                if score is not None:
                    scores.append(score)
                elif ps in [uh["text"] for uh in uploaded_highlighted]:
                    for uh in uploaded_highlighted:
                        if uh["text"] == ps:
                            scores.append(uh["score"])
                            break

            avg_score = sum(scores) / len(scores) if scores else 0.0
            if avg_score >= 0.4:
                matched_pages_count += 1
            page_heatmap.append(
                {"page": idx + 1, "similarity": round(avg_score * 100, 2)}
            )

    # ── AI Summary ────────────────────────────────────────────────────────────
    ai_summary: Dict[str, list] = {"copied": [], "similar": [], "unique": []}
    current_section = "General"
    for h in uploaded_highlighted:
        text = h["text"]
        words = text.split()
        if 0 < len(words) <= 7 and (
            text.isupper() or text.istitle() or re.match(r'^Q\d+', text, re.I)
        ):
            current_section = text

        if h["color"] == "red":
            if current_section not in ai_summary["copied"]:
                ai_summary["copied"].append(current_section)
        elif h["color"] == "yellow":
            if current_section not in ai_summary["similar"]:
                ai_summary["similar"].append(current_section)
        elif h["color"] == "green":
            if current_section not in ai_summary["unique"]:
                ai_summary["unique"].append(current_section)

    ai_summary["unique"] = [
        s for s in ai_summary["unique"]
        if s not in ai_summary["copied"] and s not in ai_summary["similar"]
    ][:5]
    ai_summary["similar"] = [
        s for s in ai_summary["similar"]
        if s not in ai_summary["copied"]
    ][:5]
    ai_summary["copied"] = ai_summary["copied"][:5]

    if overall_similarity > 80 and not ai_summary["copied"] and not ai_summary["similar"]:
        ai_summary["similar"] = ["General"]

    return {
        "uploaded_highlighted": uploaded_highlighted,
        "matched_highlighted": matched_highlighted,
        "evidence_records": evidence_records,
        "ai_summary": ai_summary,
        "page_heatmap": page_heatmap,
        "detection_method": detection_method,
        "overall_similarity": overall_similarity,
        "breakdown": {
            "Exact Match": 0.0,
            "Normalized Content": round(normalized_content_sim, 2),
            "Lexical Similarity": round(lexical_sim, 2),
            "Semantic Similarity": round(semantic_sim, 2) if semantic_sim >= 0 else -1.0,
            "Sentence Similarity": round(sentence_similarity, 2),
            "Paragraph Similarity": round(paragraph_similarity, 2),
        },
        "match_statistics": {
            "Total Pages": len(upload_pages) if upload_pages else 1,
            "Matched Pages": (
                matched_pages_count
                if upload_pages
                else (1 if sentence_similarity > 40 else 0)
            ),
            "Total Sentences": len(uploaded_sentences),
            "Matched Sentences": matched_sentences_count,
            "Total Paragraphs": len(uploaded_paragraphs),
            "Matched Paragraphs": matched_paragraphs_count,
        },
    }
