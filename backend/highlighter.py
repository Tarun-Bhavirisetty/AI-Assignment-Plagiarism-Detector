"""
MetaGuard Advanced Document Highlighter
Resolves text offset, line-wrapping, whitespace variations, and PyMuPDF bounding-box
mapping so that every matched sentence and paragraph is accurately highlighted in PDF previews.
Never overwrites original files; generates annotated PDF bytes in-memory.
"""

import fitz  # PyMuPDF
import re
from typing import List, Dict, Any, Tuple, Optional

# Severity stroke colors in RGB (0.0 - 1.0) for PDF annotations
COLOR_PALETTE = {
    "red": (1.0, 0.28, 0.28),      # Critical / Exact Match
    "yellow": (1.0, 0.78, 0.20),   # High Overlap / Semantic
    "orange": (1.0, 0.55, 0.15),   # Moderate Overlap / Paraphrased
    "blue": (0.30, 0.60, 1.0),     # Reference Document Accent
    "green": (0.20, 0.75, 0.45),   # Clean / Unique
}

def clean_token(token: str) -> str:
    """Normalize a token for robust alignment (strip punctuation and lowercase)."""
    if not token:
        return ""
    return re.sub(r'^\W+|\W+$', '', token.lower())

def extract_word_tokens(text: str) -> List[str]:
    """Split text into normalized alphanumeric tokens."""
    tokens = []
    for w in text.split():
        c = clean_token(w)
        if c:
            tokens.append(c)
    return tokens

def group_rects_by_line(rects: List[fitz.Rect], tolerance: float = 4.0) -> List[fitz.Rect]:
    """
    Merge adjacent word bounding boxes on the same line into contiguous line rectangles
    to avoid fragmented highlights.
    """
    if not rects:
        return []

    # Sort rects by y0 (top), then x0 (left)
    sorted_rects = sorted(rects, key=lambda r: (round(r.y0 / tolerance) * tolerance, r.x0))
    lines: List[List[fitz.Rect]] = []

    for r in sorted_rects:
        if not lines:
            lines.append([r])
            continue
        last_line = lines[-1]
        last_r = last_line[-1]
        # Same line check (y overlap)
        if abs(r.y0 - last_r.y0) <= tolerance or abs(r.y1 - last_r.y1) <= tolerance:
            last_line.append(r)
        else:
            lines.append([r])

    merged: List[fitz.Rect] = []
    for line in lines:
        x0 = min(r.x0 for r in line)
        y0 = min(r.y0 for r in line)
        x1 = max(r.x1 for r in line)
        y1 = max(r.y1 for r in line)
        merged.append(fitz.Rect(x0, y0, x1, y1))

    return merged

def search_page_word_sequence(page: fitz.Page, target_text: str) -> List[fitz.Rect]:
    """
    Robust word-sequence matcher that scans PyMuPDF page words.
    Overcomes newlines, hyphens, double spaces, and character encoding differences.
    """
    target_tokens = extract_word_tokens(target_text)
    if not target_tokens or len(target_tokens) < 2:
        return []

    # page.get_text("words") returns tuples: (x0, y0, x1, y1, word_str, block, line, word_no)
    page_words = page.get_text("words")
    if not page_words:
        return []

    page_tokens = [clean_token(w[4]) for w in page_words]
    M = len(page_tokens)
    N = len(target_tokens)

    matched_rects: List[fitz.Rect] = []

    # 1. Exact sequence search
    for i in range(M - N + 1):
        if page_tokens[i:i + N] == target_tokens:
            for k in range(i, i + N):
                matched_rects.append(fitz.Rect(page_words[k][:4]))
            return matched_rects

    # 2. Relaxed sequence search with 80% token match (for slight OCR or punctuation differences)
    if N >= 5:
        best_match_ratio = 0.0
        best_range: Optional[Tuple[int, int]] = None
        for i in range(M - N + 1):
            window = page_tokens[i:i + N]
            matches = sum(1 for a, b in zip(window, target_tokens) if a == b)
            ratio = matches / N
            if ratio > best_match_ratio and ratio >= 0.75:
                best_match_ratio = ratio
                best_range = (i, i + N)

        if best_range:
            start, end = best_range
            for k in range(start, end):
                matched_rects.append(fitz.Rect(page_words[k][:4]))
            return matched_rects

    # 3. Sub-phrase search (split long sentence into 4-grams and match overlapping parts)
    if N >= 8:
        step = max(3, N // 3)
        for i in range(0, N - 3, step):
            sub = target_tokens[i:i + 4]
            L = len(sub)
            for j in range(M - L + 1):
                if page_tokens[j:j + L] == sub:
                    for k in range(j, j + L):
                        r = fitz.Rect(page_words[k][:4])
                        if r not in matched_rects:
                            matched_rects.append(r)

    return matched_rects

def find_sentence_rects_on_page(page: fitz.Page, sentence_text: str) -> List[fitz.Rect]:
    """
    Multi-pass locator for a sentence on a single PDF page.
    Combines PyMuPDF search_for with robust word-sequence matching.
    """
    clean_sent = " ".join(sentence_text.split()).strip()
    if len(clean_sent) < 4:
        return []

    # Pass 1: Built-in search_for with de-hyphenation
    try:
        insts = page.search_for(clean_sent, flags=fitz.TEXT_DEHYPHENATE | fitz.TEXT_PRESERVE_WHITESPACE)
        if insts:
            return [fitz.Rect(inst) for inst in insts]
    except Exception:
        pass

    # Pass 2: Clean punctuation and search
    no_punct = re.sub(r'[\'\"«»“”‘’()[\]{}—–]', '', clean_sent)
    if no_punct != clean_sent:
        try:
            insts = page.search_for(no_punct, flags=fitz.TEXT_DEHYPHENATE)
            if insts:
                return [fitz.Rect(inst) for inst in insts]
        except Exception:
            pass

    # Pass 3: Word-sequence matching across linebreaks
    word_rects = search_page_word_sequence(page, clean_sent)
    if word_rects:
        return group_rects_by_line(word_rects)

    return []

def annotate_pdf_with_evidence(
    file_path: str,
    evidence_records: List[Dict[str, Any]],
    target_type: str = "uploaded"
) -> bytes:
    """
    Annotates a PDF in-memory with crisp, color-coded highlights using structured evidence records.
    Never modifies original file on disk.
    
    Parameters:
      file_path: Path to original PDF.
      evidence_records: List of evidence items with matched_sentence, reference_sentence,
                        uploaded_page, reference_page, and color.
      target_type: 'uploaded' to highlight student submission, 'matched' for reference document.
    
    Returns:
      PDF binary bytes ready for response or iframe preview.
    """
    doc = fitz.open(file_path)

    # Group evidence items by target page for fast scoped lookups
    # Page numbers are 1-based in evidence_records
    for page_idx, page in enumerate(doc):
        page_num = page_idx + 1

        # Collect items specifically on this page or without strict page restrictions
        page_items = [
            e for e in evidence_records
            if (e.get("uploaded_page" if target_type == "uploaded" else "reference_page") == page_num)
        ]

        # If no page-scoped items, fall back to all items (handles single-page or unpaginated evidence)
        candidates = page_items if page_items else evidence_records

        for ev in candidates:
            color_name = ev.get("color", "red")
            if color_name not in COLOR_PALETTE:
                color_name = "red"

            target_text = (
                ev.get("matched_sentence") if target_type == "uploaded" else ev.get("reference_sentence")
            ) or ev.get("text", "")

            if not target_text or len(target_text.strip()) < 4:
                continue

            rects = find_sentence_rects_on_page(page, target_text)

            if rects:
                ev["location_status"] = "mapped"
                stroke_color = COLOR_PALETTE[color_name]

                # Highlight line by line
                for r in rects:
                    # Validate rect coordinates
                    if r.x0 >= r.x1 or r.y0 >= r.y1:
                        continue
                    try:
                        annot = page.add_highlight_annot(r)
                        if annot:
                            annot.set_colors(stroke=stroke_color)
                            annot.set_info(
                                title="MetaGuard Integrity Match",
                                content=f"Match Score: {round(float(ev.get('score', 1.0) * 100))}% | Type: {ev.get('match_type', 'Plagiarism')}"
                            )
                            annot.update()
                    except Exception as e:
                        # Continue highlighting remaining rects if one fails
                        continue

    pdf_bytes = doc.write()
    doc.close()
    return pdf_bytes
