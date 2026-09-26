import os
import fitz  # PyMuPDF
import docx
import re
try:
    import pytesseract
    from PIL import Image
    import io
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

def clean_text(text: str) -> str:
    """Normalize whitespace and remove invalid chars."""
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text)
    text = text.replace('\x00', '')
    return text.strip()

def extract_questions(text: str) -> list[dict]:
    """Finds questions like Q1., Question 1:, 1), etc."""
    questions = []
    pattern = r'(?i)(?:Q|Question\s*)\d+[\.\:\)]'
    matches = list(re.finditer(pattern, text))
    
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i+1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        questions.append({"id": match.group(0), "content": content})
    return questions

def extract_text_from_pdf(file_path: str) -> tuple[str, list[str]]:
    text = ""
    pages_text = []
    try:
        doc = fitz.open(file_path)
        for page in doc:
            t = page.get_text()
            if not t.strip() and TESSERACT_AVAILABLE:
                try:
                    pix = page.get_pixmap()
                    img = Image.open(io.BytesIO(pix.tobytes()))
                    t = pytesseract.image_to_string(img)
                except Exception as ocr_e:
                    print(f"OCR skipped for page: {ocr_e}")
                    
            if t:
                text += t + "\n"
                pages_text.append(t)
            else:
                pages_text.append("")
        doc.close()
    except Exception as e:
        print(f"PDF extraction error: {e}")
    return text, pages_text

def extract_text_from_docx(file_path: str) -> str:
    text = ""
    try:
        doc = docx.Document(file_path)
        for para in doc.paragraphs:
            text += para.text + "\n"
    except Exception as e:
        print(f"DOCX extraction error: {e}")
    return text

def extract_text_from_txt(file_path: str) -> str:
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    except Exception as e:
        print(f"TXT extraction error: {e}")
    return ""

def extract_and_clean(file_path: str, file_type: str) -> tuple[str, str, list]:
    """Returns (original_text, cleaned_text, pages_text)"""
    ext = os.path.splitext(file_path)[1].lower()
    
    original = ""
    pages_text = []
    
    if ext == ".pdf":
        original, pages_text = extract_text_from_pdf(file_path)
    elif ext == ".docx":
        original = extract_text_from_docx(file_path)
    elif ext == ".txt" or "text" in file_type:
        original = extract_text_from_txt(file_path)
    
    # Clean text to normalize whitespace and newlines
    cleaned = clean_text(original)
    
    # Extract basic structural metadata
    structure = {
        "questions": extract_questions(cleaned),
        "paragraphs": len(cleaned.split('\n\n'))
    }
    
    return original, cleaned, pages_text, structure
