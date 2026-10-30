import re
from typing import List

# Privacy-protection patterns
_SKIP_PATTERNS = [
    re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b'),  # email
    re.compile(r'\b\d{2}[A-Z]{2,5}\d{4,}\b'),  # registration number-like
    re.compile(r'\b\d{10,}\b'),  # long phone numbers
]

# Common boilerplate to skip
_BOILERPLATE = [
    "all rights reserved",
    "copyright",
    "page ",
    "table of contents",
    "references",
    "bibliography",
    "acknowledgement",
    "www.",
    "http",
    "figure ",
    "table ",
]

MIN_CHARS = 45
MAX_CHARS = 200


def _is_sensitive(text: str) -> bool:
    for pat in _SKIP_PATTERNS:
        if pat.search(text):
            return True
    return False


def _is_boilerplate(text: str) -> bool:
    lower = text.lower().strip()
    for bp in _BOILERPLATE:
        if bp in lower:
            return True
    if lower.count(',') > 5:
        return True
    return False


def _informativeness_score(text: str) -> float:
    """Higher = more unique word ratio × length factor."""
    words = text.lower().split()
    if not words:
        return 0.0
    unique_ratio = len(set(words)) / len(words)
    length_factor = min(len(text) / 100, 1.5)
    return unique_ratio * length_factor


def select_passages(text: str, max_count: int = 5) -> List[str]:
    """Select the most informative, privacy-safe passages for web searching."""
    sentences = re.split(r'(?<=[.!?])\s+', text)

    candidates = []
    for sent in sentences:
        sent = sent.strip()
        if len(sent) < MIN_CHARS or len(sent) > MAX_CHARS:
            continue
        if _is_sensitive(sent):
            continue
        if _is_boilerplate(sent):
            continue
        digit_ratio = sum(c.isdigit() for c in sent) / len(sent)
        if digit_ratio > 0.4:
            continue
        candidates.append((sent, _informativeness_score(sent)))

    # Sort by informativeness descending
    candidates.sort(key=lambda x: x[1], reverse=True)

    selected: List[str] = []
    selected_lower: List[str] = []
    for sent, _ in candidates:
        sent_lower = sent.lower()
        # Skip near-duplicates (>70% word overlap with already selected)
        words_sent = set(sent_lower.split())
        is_dup = any(
            len(words_sent & set(prev.split())) / max(len(words_sent), 1) > 0.7
            for prev in selected_lower
        )
        if not is_dup:
            selected.append(sent[:MAX_CHARS])
            selected_lower.append(sent_lower)
        if len(selected) >= max_count:
            break

    return selected
