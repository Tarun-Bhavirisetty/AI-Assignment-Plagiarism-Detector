import os
from PIL import Image
from PIL.ExifTags import TAGS
import cv2

def extract_metadata(file_path: str, file_type: str) -> dict:
    metadata = {}
    
    # 1. File size
    try:
        size_bytes = os.path.getsize(file_path)
        metadata["size_bytes"] = size_bytes
        metadata["size_mb"] = round(size_bytes / (1024 * 1024), 2)
    except Exception:
        pass
        
    # 2. Format / Type specific
    if "image" in file_type:
        try:
            with Image.open(file_path) as img:
                metadata["format"] = img.format
                metadata["dimensions"] = f"{img.width}x{img.height}"
                # Try extract basic EXIF
                exif_data = img.getexif()
                if exif_data:
                    device_info = ""
                    for tag_id, data in exif_data.items():
                        tag = TAGS.get(tag_id, tag_id)
                        if tag == "Make":
                            device_info += str(data) + " "
                        elif tag == "Model":
                            device_info += str(data)
                    if device_info.strip():
                        metadata["device_info"] = device_info.strip()
        except Exception:
            pass
            
    elif "video" in file_type or "audio" in file_type:
        try:
            # Note: OpenCV is for video, not the best for audio duration, but a basic approach.
            # Real production might use ffprobe/moviepy for audio/video.
            cap = cv2.VideoCapture(file_path)
            if cap.isOpened():
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                if fps > 0:
                    duration = frame_count / fps
                    metadata["duration_seconds"] = round(duration, 2)
                
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                if width > 0 and height > 0:
                    metadata["dimensions"] = f"{width}x{height}"
            cap.release()
        except Exception:
            pass
            
    elif "pdf" in file_type:
        metadata["format"] = "PDF"
        
    elif "text" in file_type:
        metadata["format"] = "TEXT"
        
    return metadata
