import os
import chromadb
from ai.embedding_engine import embedding_engine

# Initialize ChromaDB client (local persistent)
os.makedirs("chroma_db", exist_ok=True)
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="uploads_embeddings")

def generate_text_embedding(text_content: str):
    return embedding_engine.generate_embedding(text_content)

def add_to_chroma(upload_id: str, embedding: list, metadata: dict):
    if embedding is None:
        return
    collection.add(
        embeddings=[embedding],
        metadatas=[metadata],
        ids=[upload_id]
    )

def search_similar(embedding: list, threshold=0.85):
    if embedding is None:
        return {"is_similar": False}
        
    # Search top 5 candidates instead of 1 for document matching
    results = collection.query(
        query_embeddings=[embedding],
        n_results=5
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
                "matched_id": results['ids'][0][0],
                "all_candidates": results['ids'][0]
            }
    return {"is_similar": False}
