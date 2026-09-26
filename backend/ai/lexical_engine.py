from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

class LexicalEngine:
    def __init__(self):
        pass

    def compute_similarity(self, source_sentences: list, target_sentences: list):
        """
        Computes cosine similarity between two lists of sentences using TF-IDF.
        Returns a 2D numpy array of shape (len(source_sentences), len(target_sentences)).
        """
        if not source_sentences or not target_sentences:
            return np.array([])
            
        vectorizer = TfidfVectorizer().fit(source_sentences + target_sentences)
        source_tfidf = vectorizer.transform(source_sentences)
        target_tfidf = vectorizer.transform(target_sentences)
        
        return cosine_similarity(source_tfidf, target_tfidf)

lexical_engine = LexicalEngine()
