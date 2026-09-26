import fitz
import io

def generate_pdf_report(upload, comparison_data, case=None):
    doc = fitz.open()
    page = doc.new_page()
    
    # Fonts
    text_color = (0, 0, 0)
    
    y = 50
    # Title
    page.insert_text((50, y), "META GUARD", fontsize=20, color=(0.1, 0.3, 0.8), fontname="helv", fontfile=None)
    y += 25
    page.insert_text((50, y), "Academic Integrity Analysis Report", fontsize=14, color=(0.4, 0.4, 0.4))
    y += 40
    
    # Metadata
    page.insert_text((50, y), f"Student: {upload.owner.name if upload.owner else 'Unknown'}", fontsize=11)
    y += 15
    page.insert_text((50, y), f"Assignment: {upload.assignment_title or 'N/A'}", fontsize=11)
    y += 15
    page.insert_text((50, y), f"Section: {upload.section_name or 'N/A'}", fontsize=11)
    y += 15
    page.insert_text((50, y), f"Submission Date: {upload.upload_time.strftime('%Y-%m-%d %H:%M') if upload.upload_time else 'Unknown'}", fontsize=11)
    y += 30
    
    # Similarity
    page.insert_text((50, y), "Similarity Evidence", fontsize=14, fontname="helv-bo")
    y += 25
    page.insert_text((50, y), f"Overall Similarity: {upload.similarity_score or 0.0}%", fontsize=12)
    y += 15
    page.insert_text((50, y), f"Primary Detection Method: {comparison_data.get('detection_method', 'N/A')}", fontsize=11)
    y += 30
    
    # Matched Text (Red/Yellow only)
    page.insert_text((50, y), "Top Matched Segments", fontsize=14, fontname="helv-bo")
    y += 20
    
    highlights = comparison_data.get("uploaded_highlighted", [])
    matched = [h["text"] for h in highlights if h["color"] in ["red", "yellow"]]
    
    for text in matched[:5]:
        if y > 750:
            page = doc.new_page()
            y = 50
        # wrap text
        words = text.split()
        line = "• "
        for word in words:
            if fitz.get_text_length(line + word + " ", fontname="helv", fontsize=10) < 450:
                line += word + " "
            else:
                page.insert_text((50, y), line, fontsize=10)
                y += 12
                line = "  " + word + " "
                if y > 750:
                    page = doc.new_page()
                    y = 50
        page.insert_text((50, y), line, fontsize=10)
        y += 20
        
    y += 20
    if y > 750:
        page = doc.new_page()
        y = 50
        
    page.insert_text((50, y), "Teacher Review", fontsize=14, fontname="helv-bo")
    y += 25
    status = case.status if case else "Not Reviewed"
    notes = case.teacher_notes if case and case.teacher_notes else "No notes provided."
    page.insert_text((50, y), f"Status: {status}", fontsize=11)
    y += 15
    
    # Wrap notes
    words = notes.split()
    line = ""
    for word in words:
        if fitz.get_text_length(line + word + " ", fontname="helv", fontsize=10) < 450:
            line += word + " "
        else:
            page.insert_text((50, y), line, fontsize=10)
            y += 12
            line = word + " "
            if y > 750:
                page = doc.new_page()
                y = 50
    page.insert_text((50, y), line, fontsize=10)
    
    pdf_bytes = doc.write()
    doc.close()
    return pdf_bytes
