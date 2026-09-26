import logging

logger = logging.getLogger(__name__)

class EmbeddingEngine:
    def __init__(self):
        self.model = None
        self.is_available = True  # Assume true until we fail to load
        self.load_error = None

    def _lazy_load(self):
        if self.model is not None:
            return True
        if not self.is_available:
            return False
            
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            return True
        except MemoryError as e:
            logger.error(f"MemoryError loading SentenceTransformer: {e}")
            self.is_available = False
            self.load_error = str(e)
            return False
        except ImportError as e:
            logger.error(f"ImportError loading SentenceTransformer: {e}. Package missing?")
            self.is_available = False
            self.load_error = str(e)
            return False
        except Exception as e:
            logger.error(f"Unexpected error loading SentenceTransformer: {e}")
            self.is_available = False
            self.load_error = str(e)
            return False

    def generate_embedding(self, text: str) -> list:
        """Returns embedding if available, otherwise None"""
        if not self._lazy_load():
            return None
        try:
            # We need to return a list for ChromaDB
            return self.model.encode(text).tolist()
        except Exception as e:
            logger.error(f"Error encoding text: {e}")
            return None
            
    def generate_embeddings_batch(self, texts: list) -> list:
        if not self._lazy_load() or not texts:
            return None
        try:
            # For comparison logic using tensors
            return self.model.encode(texts, convert_to_tensor=True)
        except Exception as e:
            logger.error(f"Error encoding text batch: {e}")
            return None

# Singleton instance
embedding_engine = EmbeddingEngine()
