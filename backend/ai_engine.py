import os
import chromadb
from sentence_transformers import SentenceTransformer
from PIL import Image

# Initialize ChromaDB client (local persistent)
os.makedirs("chroma_db", exist_ok=True)
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="uploads_embeddings")

# Load a lightweight embedding model for text
text_model = SentenceTransformer('all-MiniLM-L6-v2')
# Note: For images, we will use perceptual hash for basic similarity, 
# and optionally CLIP for image embeddings if needed. For simplicity and performance, 
# imagehash is primarily used in duplicate_detector.py, and text uses this.

def generate_text_embedding(text_content: str):
    return text_model.encode(text_content).tolist()

def add_to_chroma(upload_id: str, embedding: list, metadata: dict):
    collection.add(
        embeddings=[embedding],
        metadatas=[metadata],
        ids=[upload_id]
    )

def search_similar(embedding: list, threshold=0.85):
    # Search top 1
    results = collection.query(
        query_embeddings=[embedding],
        n_results=1
    )
    
    if results['distances'] and results['distances'][0]:
        distance = results['distances'][0][0]
        # In ChromaDB (using default L2), distance = 0 means exact match.
        # We can approximate similarity % (this is a rough heuristic)
        similarity = max(0, 100 - (distance * 50)) 
        
        if similarity >= (threshold * 100):
            return {
                "is_similar": True,
                "similarity_score": round(similarity, 2),
                "matched_id": results['ids'][0][0]
            }
    return {"is_similar": False}
