import hashlib
import imagehash
from PIL import Image

def get_exact_hash(file_path: str) -> str:
    """Calculates SHA256 exact hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        # Read and update hash string value in blocks of 4K
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def get_image_phash(file_path: str) -> str:
    """Calculates perceptual hash (phash) for an image."""
    try:
        with Image.open(file_path) as img:
            return str(imagehash.phash(img))
    except Exception:
        return ""

def calculate_phash_similarity(hash1_str: str, hash2_str: str) -> float:
    """Calculates similarity percentage between two perceptual hashes."""
    if not hash1_str or not hash2_str:
        return 0.0
    
    hash1 = imagehash.hex_to_hash(hash1_str)
    hash2 = imagehash.hex_to_hash(hash2_str)
    
    # Maximum difference is 64 bits for standard phash
    difference = hash1 - hash2
    similarity = max(0, 100 - (difference * (100 / 64)))
    return round(similarity, 2)
