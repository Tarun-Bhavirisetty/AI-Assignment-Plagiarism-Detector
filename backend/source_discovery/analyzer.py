import re
from typing import Optional
from .providers.base import SearchResult


def _find_exact_phrase_overlap(assignment_text: str, source_snippet: str, min_words: int = 6) -> Optional[str]:
    """Find longest exact phrase overlap (min_words consecutive words)."""
    a_words = assignment_text.lower().split()
    s_words = source_snippet.lower().split()

    best_match = None
    best_len = 0
    a_joined = ' '.join(a_words)

    for start in range(len(s_words)):
        for end in range(start + min_words, min(start + 30, len(s_words)) + 1):
            phrase = ' '.join(s_words[start:end])
            if phrase in a_joined:
                if (end - start) > best_len:
                    best_len = end - start
                    best_match = phrase

    return best_match


def _jaccard_similarity(text_a: str, text_b: str) -> float:
    """Word-level Jaccard similarity."""
    words_a = set(re.findall(r'\b\w+\b', text_a.lower()))
    words_b = set(re.findall(r'\b\w+\b', text_b.lower()))
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


def analyze_match(query_passage: str, assignment_text: str, result: SearchResult) -> dict:
    """
    Determine similarity between an assignment passage and a search result snippet.
    Returns: assignment_excerpt, source_excerpt, method, score
    """
    snippet = result.snippet or ""

    if not snippet.strip():
        return {
            "assignment_excerpt": query_passage[:300],
            "source_excerpt": "",
            "method": "snippet_unavailable",
            "score": 0.0,
        }

    # Try exact phrase match (strongest signal)
    phrase = _find_exact_phrase_overlap(assignment_text, snippet, min_words=6)
    if phrase:
        return {
            "assignment_excerpt": query_passage[:300],
            "source_excerpt": snippet[:300],
            "method": "exact_phrase",
            "score": min(1.0, round(len(phrase.split()) / 10, 4)),
        }

    # Jaccard overlap
    jaccard = _jaccard_similarity(query_passage, snippet)

    method = "lexical_overlap" if jaccard > 0.15 else "snippet_based"
    return {
        "assignment_excerpt": query_passage[:300],
        "source_excerpt": snippet[:300],
        "method": method,
        "score": round(jaccard, 4),
    }
