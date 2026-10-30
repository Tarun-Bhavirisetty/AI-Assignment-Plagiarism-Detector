import os
import unittest
from unittest.mock import patch, MagicMock

import models
from database import SessionLocal
from source_discovery.passage_selector import select_passages, _is_sensitive, _is_boilerplate
from source_discovery.analyzer import analyze_match, _find_exact_phrase_overlap, _jaccard_similarity
from source_discovery.providers.base import SearchResult
from source_discovery.providers.tavily import (
    TavilyProvider,
    TavilyQuotaExhaustedError,
    TavilyAuthError,
    TavilyConnectionError,
)
from source_discovery.service import run_source_discovery


class MockSearchProvider:
    """Mock search provider for reliable offline testing."""
    def __init__(self, results=None, is_available_val=True, raise_exc=None):
        self._results = results or []
        self._is_available = is_available_val
        self._raise_exc = raise_exc

    def is_available(self) -> bool:
        return self._is_available

    def search(self, query: str, max_results: int = 5) -> list:
        if self._raise_exc:
            raise self._raise_exc
        return self._results


class TestSourceDiscoveryUnit(unittest.TestCase):
    """Unit tests for passage selection, evidence analysis, and providers."""

    def test_passage_selector_filters_pii(self):
        """Ensure sensitive PII (emails, reg numbers, phone numbers) are never extracted."""
        text_with_pii = (
            "Contact me at student123@university.edu for assignment questions. "
            "My registration number is 23BCE10452 and phone is 9876543210. "
            "Support Vector Machines are supervised learning models used for classification and regression analysis."
        )
        passages = select_passages(text_with_pii, max_count=5)
        self.assertTrue(len(passages) >= 1)
        for p in passages:
            self.assertNotIn("student123@university.edu", p)
            self.assertNotIn("23BCE10452", p)
            self.assertNotIn("9876543210", p)
        self.assertTrue(any("Support Vector Machines" in p for p in passages))

    def test_passage_selector_filters_boilerplate(self):
        """Ensure common academic boilerplate is ignored."""
        text = (
            "Table of contents page 1. All rights reserved copyright 2026. "
            "Neural networks with residual connections mitigate the vanishing gradient problem in deep architectures."
        )
        passages = select_passages(text, max_count=5)
        self.assertEqual(len(passages), 1)
        self.assertIn("vanishing gradient", passages[0])

    def test_analyzer_exact_phrase_match(self):
        """Verify exact phrase detection when 6+ consecutive words match."""
        assignment = "Convolutional neural networks are particularly well suited for spatial feature extraction in images."
        snippet = "Recent work shows convolutional neural networks are particularly well suited for spatial feature extraction across diverse benchmarks."
        res = SearchResult(title="CNN Paper", url="https://example.org/cnn", snippet=snippet, domain="example.org")
        
        match = analyze_match("convolutional neural networks are particularly well suited", assignment, res)
        self.assertEqual(match["method"], "exact_phrase")
        self.assertGreater(match["score"], 0.5)

    def test_analyzer_jaccard_overlap(self):
        """Verify lexical overlap calculation when exact phrase is not present."""
        assignment = "Gradient descent optimizes neural network parameters iteratively."
        snippet = "Neural network parameters are updated iteratively through gradient descent optimization."
        res = SearchResult(title="Optimization", url="https://example.org/opt", snippet=snippet, domain="example.org")

        match = analyze_match(assignment, assignment, res)
        self.assertIn(match["method"], ["lexical_overlap", "snippet_based"])
        self.assertGreater(match["score"], 0.2)

    def test_tavily_missing_key_behavior(self):
        """Verify Tavily provider reports unavailable when key is empty."""
        with patch.dict(os.environ, {"TAVILY_API_KEY": ""}):
            provider = TavilyProvider()
            self.assertFalse(provider.is_available())
            self.assertEqual(provider.search("machine learning"), [])

    def test_tavily_quota_error(self):
        """Verify 429 status raises TavilyQuotaExhaustedError."""
        with patch.dict(os.environ, {"TAVILY_API_KEY": "test_key"}):
            provider = TavilyProvider()
            mock_resp = MagicMock()
            mock_resp.status_code = 429
            with patch("httpx.post", return_value=mock_resp):
                with self.assertRaises(TavilyQuotaExhaustedError):
                    provider.search("test query")

    def test_tavily_auth_error(self):
        """Verify 401 status raises TavilyAuthError."""
        with patch.dict(os.environ, {"TAVILY_API_KEY": "bad_key"}):
            provider = TavilyProvider()
            mock_resp = MagicMock()
            mock_resp.status_code = 401
            with patch("httpx.post", return_value=mock_resp):
                with self.assertRaises(TavilyAuthError):
                    provider.search("test query")


class TestSourceDiscoveryWorkflow(unittest.TestCase):
    """Integration tests with database models and service workflows."""

    def setUp(self):
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_service_unavailable_without_key(self):
        """run_source_discovery returns status: 'unavailable' when no key is set."""
        upload = self.db.query(models.Upload).first()
        self.assertIsNotNone(upload)

        with patch.dict(os.environ, {"TAVILY_API_KEY": ""}):
            result = run_source_discovery(upload.id, self.db)
            self.assertEqual(result["status"], "unavailable")
            self.assertIn("not configured", result["message"].lower())

    def test_service_executes_with_mock_provider(self):
        """run_source_discovery executes, creates OnlineSourceJob, and saves results."""
        upload = self.db.query(models.Upload).filter(models.Upload.extracted_text != None).first()
        self.assertIsNotNone(upload)

        mock_results = [
            SearchResult(
                title="Wikipedia - Machine Learning",
                url="https://en.wikipedia.org/wiki/Machine_learning",
                snippet="Machine learning is a field of inquiry devoted to understanding and building methods that learn.",
                domain="en.wikipedia.org",
                published_date="2025-01-01"
            )
        ]
        mock_provider = MockSearchProvider(results=mock_results, is_available_val=True)

        result = run_source_discovery(upload.id, self.db, force_refresh=True, provider=mock_provider)
        self.assertEqual(result["status"], "completed")
        self.assertIsNotNone(result["job_id"])
        self.assertGreater(len(result["results"]), 0)
        self.assertEqual(result["results"][0]["source_domain"], "en.wikipedia.org")

        # Verify database record persistence
        job = self.db.query(models.OnlineSourceJob).filter(models.OnlineSourceJob.id == result["job_id"]).first()
        self.assertIsNotNone(job)
        self.assertEqual(job.status, "completed")

        db_results = self.db.query(models.OnlineSourceResult).filter(models.OnlineSourceResult.job_id == job.id).all()
        self.assertGreater(len(db_results), 0)

        # Test caching on second call (force_refresh=False)
        cached = run_source_discovery(upload.id, self.db, force_refresh=False, provider=mock_provider)
        self.assertEqual(cached["status"], "completed")
        self.assertEqual(cached["job_id"], job.id)

    def test_service_handles_quota_exhausted_gracefully(self):
        """run_source_discovery records failure when quota is exhausted without crashing."""
        upload = self.db.query(models.Upload).filter(models.Upload.extracted_text != None).first()
        self.assertIsNotNone(upload)

        mock_provider = MockSearchProvider(
            is_available_val=True,
            raise_exc=TavilyQuotaExhaustedError("Quota reached")
        )
        result = run_source_discovery(upload.id, self.db, force_refresh=True, provider=mock_provider)
        self.assertEqual(result["status"], "failed")
        self.assertIn("quota", result["message"].lower())


class TestCrossSectionAndHistoricalComparison(unittest.TestCase):
    """End-to-end tests for cross-section comparison, reference resolution, and nullable scores."""

    def setUp(self):
        self.db = SessionLocal()
        self.admin = self.db.query(models.User).filter(models.User.role == "admin").first()

    def tearDown(self):
        self.db.close()

    def test_cross_section_duplicate_reference(self):
        """Cross-section duplicate (Upload 16 SEC-A & Upload 17 SEC-B) correctly resolves reference."""
        from routes import compare_uploads
        res17 = compare_uploads(upload_id=17, current_user=self.admin, db=self.db)
        self.assertEqual(res17["reference_upload_id"], 16)
        self.assertEqual(res17["uploaded_document"]["section_name"], "SEC-B")
        self.assertEqual(res17["reference_document"]["section_name"], "SEC-A")
        self.assertEqual(res17["overall_similarity"], 100.0)
        self.assertEqual(res17["detection_method"], "exact_hash")

    def test_historical_upload_repair_resolution(self):
        """Historical uploads 7 and 10 resolve reference documents with accurate similarity scores."""
        from routes import compare_uploads
        res7 = compare_uploads(upload_id=7, current_user=self.admin, db=self.db)
        self.assertEqual(res7["reference_upload_id"], 5)
        self.assertAlmostEqual(res7["overall_similarity"], 92.37, delta=1.0)
        self.assertEqual(res7["detection_method"], "hybrid_st_tfidf")

        res10 = compare_uploads(upload_id=10, current_user=self.admin, db=self.db)
        self.assertEqual(res10["reference_upload_id"], 1)
        self.assertAlmostEqual(res10["overall_similarity"], 95.26, delta=1.0)
        self.assertEqual(res10["detection_method"], "hybrid_st_tfidf")

    def test_reference_upload_null_similarity_preserved(self):
        """Original reference upload 11 preserves None in database, but compare endpoint calculates 100% against its duplicate."""
        u11 = self.db.query(models.Upload).filter(models.Upload.id == 11).first()
        # Original stored score in database remains None (first upload was unique)
        self.assertIsNone(u11.similarity_score)

        from routes import compare_uploads
        res11 = compare_uploads(upload_id=11, current_user=self.admin, db=self.db)
        # Authoritative comparison with duplicate (Upload 12) is 100%
        self.assertEqual(res11["overall_similarity"], 100.0)


if __name__ == "__main__":
    unittest.main()
