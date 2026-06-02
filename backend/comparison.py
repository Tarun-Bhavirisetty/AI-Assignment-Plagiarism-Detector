import re
from typing import List, Dict, Any
import numpy as np
from sentence_transformers import SentenceTransformer, util
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Load the same lightweight model to avoid loading multiple times in different files
try:
    from ai_engine import text_model
    model = text_model
except ImportError:
    model = SentenceTransformer('all-MiniLM-L6-v2')

def split_into_sentences(text: str) -> List[str]:
    """Basic sentence splitting using regex."""
    if not text:
        return []
    # Split by standard punctuation followed by space
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

def compare_texts(uploaded_text: str, matched_text: str, upload_pages: List[str] = None) -> Dict[str, Any]:
    """
    Compare two texts sentence by sentence.
    Returns structured data with highlighted sentences, ai summary, and page heatmap.
    """
    if not uploaded_text or not matched_text:
        return {"uploaded_highlighted": [], "matched_highlighted": []}
        
    uploaded_sentences = split_into_sentences(uploaded_text)
    matched_sentences = split_into_sentences(matched_text)
    
    if not uploaded_sentences or not matched_sentences:
        return {
            "uploaded_highlighted": [{"text": uploaded_text, "color": "green"}],
            "matched_highlighted": [{"text": matched_text, "color": "green"}]
        }

    # Compute Sentence Transformer embeddings
    upload_embeddings = model.encode(uploaded_sentences, convert_to_tensor=True)
    match_embeddings = model.encode(matched_sentences, convert_to_tensor=True)
    
    # Compute Transformer cosine similarities
    st_cosine_scores = util.cos_sim(upload_embeddings, match_embeddings).cpu().numpy()
    
    # Compute TF-IDF similarities
    vectorizer = TfidfVectorizer().fit(uploaded_sentences + matched_sentences)
    upload_tfidf = vectorizer.transform(uploaded_sentences)
    match_tfidf = vectorizer.transform(matched_sentences)
    tfidf_cosine_scores = cosine_similarity(upload_tfidf, match_tfidf)
    
    # Hybrid Score (60% Semantic, 40% Exact Lexical Match via TF-IDF)
    hybrid_scores = (st_cosine_scores * 0.6) + (tfidf_cosine_scores * 0.4)
    
    uploaded_highlighted = []
    # Find best match for each uploaded sentence
    for i in range(len(uploaded_sentences)):
        best_score = float(hybrid_scores[i].max())
        color = "green" # unique
        if best_score >= 0.90:
            color = "red" # Exact/highly copied
        elif best_score >= 0.60:
            color = "yellow" # Paraphrased/similar
            
        uploaded_highlighted.append({
            "text": uploaded_sentences[i],
            "color": color,
            "score": best_score
        })
        
    matched_highlighted = []
    # Find best match for each matched sentence
    for j in range(len(matched_sentences)):
        best_score = float(hybrid_scores[:, j].max())
        color = "green"
        if best_score >= 0.90:
            color = "red"
        elif best_score >= 0.60:
            color = "yellow"
            
        matched_highlighted.append({
            "text": matched_sentences[j],
            "color": color,
            "score": best_score
        })

    # Generate AI Plagiarism Summary
    ai_summary = {"copied": [], "similar": [], "unique": []}
    current_section = "General"
    for h in uploaded_highlighted:
        text = h["text"]
        words = text.split()
        # Heuristic for section header
        if 0 < len(words) <= 5 and (text.isupper() or text.istitle()):
            current_section = text
            
        if h["color"] == "red" and current_section not in ai_summary["copied"]:
            ai_summary["copied"].append(current_section)
        elif h["color"] == "yellow" and current_section not in ai_summary["similar"]:
            ai_summary["similar"].append(current_section)
        elif h["color"] == "green" and current_section not in ai_summary["unique"]:
            ai_summary["unique"].append(current_section)
            
    # Clean up overlaps
    ai_summary["unique"] = [s for s in ai_summary["unique"] if s not in ai_summary["copied"] and s not in ai_summary["similar"]][:5]
    ai_summary["similar"] = [s for s in ai_summary["similar"] if s not in ai_summary["copied"]][:5]
    ai_summary["copied"] = ai_summary["copied"][:5]

    # Generate Page-wise Heatmap
    page_heatmap = []
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
            page_heatmap.append({
                "page": idx + 1,
                "similarity": avg_score * 100
            })

    return {
        "uploaded_highlighted": uploaded_highlighted,
        "matched_highlighted": matched_highlighted,
        "ai_summary": ai_summary,
        "page_heatmap": page_heatmap
    }
