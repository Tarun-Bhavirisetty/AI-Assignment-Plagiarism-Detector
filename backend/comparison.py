import re
from typing import List, Dict, Any
import numpy as np
from ai.similarity_engine import similarity_engine

def clean_text_for_hash(text: str) -> str:
    if not text: return ""
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

def compare_texts(uploaded_text: str, matched_text: str, upload_pages: List[str] = None, is_file_exact: bool = False) -> Dict[str, Any]:
    """
    Compare two texts at full-document, paragraph, and sentence levels.
    """
    if not uploaded_text or not matched_text:
        return {
            "uploaded_highlighted": [], "matched_highlighted": [],
            "breakdown": {}, "match_statistics": {}
        }
        
    norm_up = clean_text_for_hash(uploaded_text)
    norm_match = clean_text_for_hash(matched_text)
    is_content_exact = (norm_up == norm_match and len(norm_up) > 0)
    
    uploaded_sentences = split_into_sentences(uploaded_text)
    matched_sentences = split_into_sentences(matched_text)
    uploaded_paragraphs = split_into_paragraphs(uploaded_text)
    matched_paragraphs = split_into_paragraphs(matched_text)
    
    if is_file_exact or is_content_exact:
        # Full bypass for exact content
        uploaded_highlighted = [{"text": s, "color": "red", "score": 1.0} for s in uploaded_sentences]
        matched_highlighted = [{"text": s, "color": "red", "score": 1.0} for s in matched_sentences]
        
        page_heatmap = []
        if upload_pages:
            for idx, p in enumerate(upload_pages):
                page_heatmap.append({"page": idx + 1, "similarity": 100.0})
                
        return {
            "uploaded_highlighted": uploaded_highlighted,
            "matched_highlighted": matched_highlighted,
            "ai_summary": {"copied": ["Entire Document"], "similar": [], "unique": []},
            "page_heatmap": page_heatmap,
            "detection_method": "exact_content",
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
                "Matched Paragraphs": len(uploaded_paragraphs)
            }
        }

    # Normal multi-layer comparison
    sentence_scores, detection_method = similarity_engine.compute_hybrid_sentence_scores(uploaded_sentences, matched_sentences)
    paragraph_scores, _ = similarity_engine.compute_hybrid_sentence_scores(uploaded_paragraphs, matched_paragraphs)

    matched_sentences_count = 0
    uploaded_highlighted = []
    sentence_sim_total = 0
    for i in range(len(uploaded_sentences)):
        best_score = float(sentence_scores[i].max()) if sentence_scores.size > 0 else 0
        color = "green"
        if best_score >= 0.90:
            color = "red"
            matched_sentences_count += 1
        elif best_score >= 0.60:
            color = "yellow"
            matched_sentences_count += 1
        elif best_score >= 0.40:
            color = "orange"
            
        sentence_sim_total += best_score
        uploaded_highlighted.append({"text": uploaded_sentences[i], "color": color, "score": best_score})

    matched_highlighted = []
    for j in range(len(matched_sentences)):
        best_score = float(sentence_scores[:, j].max()) if sentence_scores.size > 0 else 0
        color = "green"
        if best_score >= 0.90:
            color = "red"
        elif best_score >= 0.60:
            color = "yellow"
        elif best_score >= 0.40:
            color = "orange"
        matched_highlighted.append({"text": matched_sentences[j], "color": color, "score": best_score})

    # Paragraph stats
    matched_paragraphs_count = 0
    paragraph_sim_total = 0
    for i in range(len(uploaded_paragraphs)):
        best_score = float(paragraph_scores[i].max()) if paragraph_scores.size > 0 else 0
        paragraph_sim_total += best_score
        if best_score >= 0.60:
            matched_paragraphs_count += 1

    sentence_similarity = (sentence_sim_total / len(uploaded_sentences)) * 100 if uploaded_sentences else 0
    paragraph_similarity = (paragraph_sim_total / len(uploaded_paragraphs)) * 100 if uploaded_paragraphs else 0
    
    # Estimates for the breakdown
    lexical_sim = sentence_similarity * 0.9 if detection_method.startswith("hybrid") else sentence_similarity
    semantic_sim = sentence_similarity * 1.1 if detection_method.startswith("hybrid") else -1.0
    semantic_sim = min(100.0, semantic_sim)
    
    # Calculate overall similarity deterministically
    overall_similarity = (sentence_similarity * 0.45) + (paragraph_similarity * 0.45) + (lexical_sim * 0.1)
    if semantic_sim > 0:
        overall_similarity = (sentence_similarity * 0.4) + (paragraph_similarity * 0.4) + (lexical_sim * 0.1) + (semantic_sim * 0.1)
    overall_similarity = min(100.0, overall_similarity)

    page_heatmap = []
    matched_pages_count = 0
    if upload_pages:
        for idx, page_text in enumerate(upload_pages):
            page_sentences = split_into_sentences(page_text)
            scores = []
            for ps in page_sentences:
                for uh in uploaded_highlighted:
                    if uh["text"] == ps:
                        scores.append(uh["score"])
                        break
            
            avg_score = sum(scores) / len(scores) if scores else 0
            if avg_score >= 0.4:
                matched_pages_count += 1
            page_heatmap.append({
                "page": idx + 1,
                "similarity": round(avg_score * 100, 2)
            })

    # AI Summary
    ai_summary = {"copied": [], "similar": [], "unique": []}
    current_section = "General"
    for h in uploaded_highlighted:
        text = h["text"]
        words = text.split()
        if 0 < len(words) <= 7 and (text.isupper() or text.istitle() or re.match(r'^Q\d+', text, re.I)):
            current_section = text
            
        if h["color"] == "red" and current_section not in ai_summary["copied"]:
            ai_summary["copied"].append(current_section)
        elif h["color"] == "yellow" and current_section not in ai_summary["similar"]:
            ai_summary["similar"].append(current_section)
        elif h["color"] == "green" and current_section not in ai_summary["unique"]:
            ai_summary["unique"].append(current_section)
            
    ai_summary["unique"] = [s for s in ai_summary["unique"] if s not in ai_summary["copied"] and s not in ai_summary["similar"]][:5]
    ai_summary["similar"] = [s for s in ai_summary["similar"] if s not in ai_summary["copied"]][:5]
    ai_summary["copied"] = ai_summary["copied"][:5]

    return {
        "uploaded_highlighted": uploaded_highlighted,
        "matched_highlighted": matched_highlighted,
        "ai_summary": ai_summary,
        "page_heatmap": page_heatmap,
        "detection_method": detection_method,
        "overall_similarity": round(overall_similarity, 2),
        "breakdown": {
            "Exact Match": 0.0,
            "Normalized Content": 0.0,
            "Lexical Similarity": round(lexical_sim, 2),
            "Semantic Similarity": round(semantic_sim, 2) if semantic_sim >= 0 else -1.0,
            "Sentence Similarity": round(sentence_similarity, 2),
            "Paragraph Similarity": round(paragraph_similarity, 2),
        },
        "match_statistics": {
            "Total Pages": len(upload_pages) if upload_pages else 1,
            "Matched Pages": matched_pages_count if upload_pages else (1 if sentence_similarity > 40 else 0),
            "Total Sentences": len(uploaded_sentences),
            "Matched Sentences": matched_sentences_count,
            "Total Paragraphs": len(uploaded_paragraphs),
            "Matched Paragraphs": matched_paragraphs_count
        }
    }
