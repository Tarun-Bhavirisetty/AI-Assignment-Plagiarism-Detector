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
    try:
        collection.upsert(
            embeddings=[embedding],
            metadatas=[metadata],
            ids=[upload_id]
        )
    except Exception:
        try:
            collection.add(
                embeddings=[embedding],
                metadatas=[metadata],
                ids=[upload_id]
            )
        except Exception as e:
            print(f"[ChromaDB] add_to_chroma warning: {e}")

def search_similar(embedding: list, threshold=0.85):
    if embedding is None:
        return {"is_similar": False}
        
    # Search top 5 candidates for document matching
    results = collection.query(
        query_embeddings=[embedding],
        n_results=5
    )
    
    if results.get('distances') and results['distances'][0]:
        distance = results['distances'][0][0]
        # In ChromaDB (using default L2), distance = 0 means exact match.
        similarity = max(0, 100 - (distance * 50)) 
        
        candidates = results.get('ids', [[]])[0]
        metadatas = results.get('metadatas', [[]])[0] if results.get('metadatas') else []
        distances = results.get('distances', [[]])[0]
        
        if similarity >= (threshold * 100):
            return {
                "is_similar": True,
                "similarity_score": round(similarity, 2),
                "matched_id": candidates[0] if candidates else None,
                "all_candidates": candidates,
                "all_metadatas": metadatas,
                "all_distances": distances
            }
    return {"is_similar": False}

def delete_from_chroma(upload_ids: list):
    """Safely delete vector embeddings from ChromaDB by upload IDs and metadata."""
    if not upload_ids:
        return
    ids_to_del = [str(uid) for uid in upload_ids if uid is not None]
    if not ids_to_del:
        return

    try:
        collection.delete(ids=ids_to_del)
    except Exception as e:
        pass

    # Also clean by metadata where upload_id is stored
    for uid in ids_to_del:
        try:
            int_id = int(uid) if uid.isdigit() else uid
            collection.delete(where={"upload_id": int_id})
        except Exception:
            pass
