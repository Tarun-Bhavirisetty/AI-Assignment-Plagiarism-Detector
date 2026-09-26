from .embedding_engine import embedding_engine
from sentence_transformers import util
import numpy as np

class SemanticEngine:
    def __init__(self):
        pass

    def is_available(self):
        return embedding_engine._lazy_load()

    def compute_similarity(self, source_sentences: list, target_sentences: list):
        """
        Computes cosine similarity using SentenceTransformers.
        Returns a 2D numpy array of shape (len(source_sentences), len(target_sentences)).
        Returns None if model is unavailable.
        """
        if not source_sentences or not target_sentences:
            return np.array([])
            
        source_embeddings = embedding_engine.generate_embeddings_batch(source_sentences)
        target_embeddings = embedding_engine.generate_embeddings_batch(target_sentences)
        
        if source_embeddings is None or target_embeddings is None:
            return None
            
        # Compute Transformer cosine similarities
        cosine_scores = util.cos_sim(source_embeddings, target_embeddings).cpu().numpy()
        return cosine_scores

semantic_engine = SemanticEngine()
