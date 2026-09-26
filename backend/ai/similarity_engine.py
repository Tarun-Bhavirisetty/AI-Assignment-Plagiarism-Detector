from .semantic_engine import semantic_engine
from .lexical_engine import lexical_engine
import numpy as np

class SimilarityEngine:
    def __init__(self):
        # Configurable weights (can be overwritten by DB settings)
        self.semantic_weight = 0.6
        self.lexical_weight = 0.4

    def compute_hybrid_sentence_scores(self, source_sentences: list, target_sentences: list):
        """
        Computes hybrid scores. Falls back to 100% lexical if semantic fails.
        Returns a tuple: (hybrid_scores, detection_method)
        """
        if not source_sentences or not target_sentences:
            return np.array([]), "none"

        lexical_scores = lexical_engine.compute_similarity(source_sentences, target_sentences)
        
        semantic_scores = None
        if semantic_engine.is_available():
            semantic_scores = semantic_engine.compute_similarity(source_sentences, target_sentences)
            
        if semantic_scores is not None:
            hybrid_scores = (semantic_scores * self.semantic_weight) + (lexical_scores * self.lexical_weight)
            return hybrid_scores, "hybrid_st_tfidf"
        else:
            # Fallback
            return lexical_scores, "fallback_tfidf"

similarity_engine = SimilarityEngine()
