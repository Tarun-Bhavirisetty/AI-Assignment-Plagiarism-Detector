"""
Comprehensive test suite for:
1. Complete & Accurate Matched Sentence Highlighting Pipeline
2. Assignment Creation, Section Scoping, Live Countdown, Late Submission & Analytics
"""

import unittest
import os
import io
import fitz
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from main import app
import database
import models
from highlighter import annotate_pdf_with_evidence, find_sentence_rects_on_page
from routes import create_access_token

client = TestClient(app)

class TestAssignmentAndHighlighting(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.db = database.SessionLocal()
        
        # Ensure test users exist
        cls.faculty_user = cls.db.query(models.User).filter(models.User.email == "faculty@metaguard.com").first()
        if not cls.faculty_user:
            cls.faculty_user = models.User(
                name="Test Faculty",
                email="faculty@metaguard.com",
                password_hash="testpass",
                role="faculty",
                department="Computer Science",
                is_verified=True
            )
            cls.db.add(cls.faculty_user)
            cls.db.commit()
            cls.db.refresh(cls.faculty_user)

        cls.student_a = cls.db.query(models.User).filter(models.User.email == "student_a@test.com").first()
        if not cls.student_a:
            cls.student_a = models.User(
                name="Student Section A",
                email="student_a@test.com",
                password_hash="testpass",
                role="student",
                department="Computer Science",
                section_name="CSE-A",
                is_verified=True
            )
            cls.db.add(cls.student_a)
            cls.db.commit()
            cls.db.refresh(cls.student_a)

        cls.student_b = cls.db.query(models.User).filter(models.User.email == "student_b@test.com").first()
        if not cls.student_b:
            cls.student_b = models.User(
                name="Student Section B",
                email="student_b@test.com",
                password_hash="testpass",
                role="student",
                department="Computer Science",
                section_name="AIML-A",
                is_verified=True
            )
            cls.db.add(cls.student_b)
            cls.db.commit()
            cls.db.refresh(cls.student_b)

        # Get or create Section CSE-A
        cls.sec_a = cls.db.query(models.Section).filter(models.Section.name == "CSE-A").first()
        if not cls.sec_a:
            cls.sec_a = models.Section(name="CSE-A", department="Computer Science")
            cls.db.add(cls.sec_a)
            cls.db.commit()
            cls.db.refresh(cls.sec_a)

        # Generate tokens
        cls.faculty_token = create_access_token({"sub": str(cls.faculty_user.id), "role": "faculty"})
        cls.student_a_token = create_access_token({"sub": str(cls.student_a.id), "role": "student"})
        cls.student_b_token = create_access_token({"sub": str(cls.student_b.id), "role": "student"})

    @classmethod
    def tearDownClass(cls):
        # Clean up test assignments and test uploads so test suite does not pollute active database
        test_titles = [
            "DBMS Assignment 2", "AI Lab Report 1", "Draft Assignment 3", 
            "Strict Expired Assignment", "Late-Permitted Assignment",
            "Software Engineering Lab 3"
        ]
        test_assigns = cls.db.query(models.Assignment).filter(models.Assignment.title.in_(test_titles)).all()
        for a in test_assigns:
            # Delete uploads and evaluations for test assignment
            ups = cls.db.query(models.Upload).filter(models.Upload.assignment_id == a.id).all()
            for u in ups:
                cls.db.query(models.Evaluation).filter(models.Evaluation.upload_id == u.id).delete()
                cls.db.delete(u)
            cls.db.query(models.AssignmentSection).filter(models.AssignmentSection.assignment_id == a.id).delete()
            cls.db.delete(a)
        cls.db.commit()
        cls.db.close()

    # ─────────────────────────────────────────────────────────────
    # FEATURE 1: HIGHLIGHTING TESTS
    # ─────────────────────────────────────────────────────────────

    def test_01_pdf_annotator_preserves_original_file(self):
        """Highlighting engine must return annotated bytes without mutating the original PDF file."""
        # Find any existing PDF upload
        up = self.db.query(models.Upload).filter(models.Upload.file_path.like("%.pdf")).first()
        self.assertIsNotNone(up, "At least one PDF upload must exist in database")
        
        orig_size = os.path.getsize(up.file_path)
        sample_evidence = [
            {
                "matched_sentence": "Campus hiring 2027",
                "reference_sentence": "Campus hiring 2027",
                "uploaded_page": 1,
                "color": "red",
                "score": 1.0,
                "match_type": "exact"
            }
        ]
        
        annotated_bytes = annotate_pdf_with_evidence(up.file_path, sample_evidence, target_type="uploaded")
        self.assertGreater(len(annotated_bytes), 0)
        self.assertTrue(annotated_bytes.startswith(b"%PDF"), "Must be a valid PDF stream")
        
        # Original file size must not have changed
        new_size = os.path.getsize(up.file_path)
        self.assertEqual(orig_size, new_size, "Original file on disk must remain untouched")

    def test_02_highlight_exact_sentence_across_lines(self):
        """Sentences spanning multiple lines with newlines/spaces must be found and highlighted."""
        up = self.db.query(models.Upload).filter(models.Upload.id == 12).first()
        if up and os.path.exists(up.file_path):
            sample_evidence = [
                {
                    "matched_sentence": "Campus hiring 2027 Digital Nurture 5.0 (Dot NET FSE)",
                    "uploaded_page": 1,
                    "color": "red",
                    "score": 1.0,
                    "match_type": "exact"
                }
            ]
            pdf_bytes = annotate_pdf_with_evidence(up.file_path, sample_evidence)
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            p1 = doc[0]
            annots = list(p1.annots())
            self.assertGreater(len(annots), 0, "Must create highlight annotations on Page 1")
            # Verify color is red (1.0, 0.28, 0.28)
            stroke = annots[0].colors.get("stroke")
            self.assertAlmostEqual(stroke[0], 1.0, places=1)
            doc.close()

    def test_03_compare_endpoint_returns_evidence_records(self):
        """GET /compare/{upload_id} must return structured evidence_records."""
        up = self.db.query(models.Upload).filter(models.Upload.id == 12).first()
        if up:
            resp = client.get(f"/compare/{up.id}", headers={"Authorization": f"Bearer {self.faculty_token}"})
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("evidence_records", data)
            self.assertIsInstance(data["evidence_records"], list)
            if data["evidence_records"]:
                first_ev = data["evidence_records"][0]
                self.assertIn("matched_sentence", first_ev)
                self.assertIn("uploaded_page", first_ev)
                self.assertIn("color", first_ev)
                self.assertIn("score", first_ev)

    def test_04_download_highlighted_pdf_endpoint(self):
        """GET /admin/download/highlighted/{upload_id} returns an inline PDF with Content-Type application/pdf."""
        up = self.db.query(models.Upload).filter(models.Upload.id == 12).first()
        if up:
            resp = client.get(f"/admin/download/highlighted/{up.id}?type=uploaded", headers={"Authorization": f"Bearer {self.faculty_token}"})
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.headers["content-type"], "application/pdf")
            self.assertTrue(resp.content.startswith(b"%PDF"))

    # ─────────────────────────────────────────────────────────────
    # FEATURE 2: ASSIGNMENT CREATION, SCOPING & SCHEDULING TESTS
    # ─────────────────────────────────────────────────────────────

    def test_05_faculty_creates_assignment_with_sections(self):
        """Authorized Faculty can create an assignment assigned to CSE-A."""
        now_utc = datetime.now(timezone.utc)
        due_str = (now_utc + timedelta(days=3)).strftime("%Y-%m-%d %H:%M")
        
        payload = {
            "title": "Software Engineering Lab 3",
            "subject": "SE401",
            "description": "Architectural Design patterns and microservices derivation.",
            "instructions": "Submit PDF documentation with UML diagram illustrations.",
            "category": "Lab Report",
            "due_date": due_str,
            "section_ids": [self.sec_a.id],
            "allow_late_submissions": True,
            "max_marks": 100.0,
            "allowed_formats": ".pdf,.docx",
            "max_file_size_mb": 50.0,
            "status": "Active"
        }

        resp = client.post("/assignments", json=payload, headers={"Authorization": f"Bearer {self.faculty_token}"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("assignment_id", data)
        self.assertEqual(data["title"], "Software Engineering Lab 3")

        # Save assignment ID for subsequent tests
        TestAssignmentAndHighlighting.created_assign_id = data["assignment_id"]

    def test_06_student_cannot_create_assignment(self):
        """Students must be strictly blocked from creating assignments (HTTP 403)."""
        now_utc = datetime.now(timezone.utc)
        payload = {
            "title": "Unauthorized Assignment",
            "due_date": (now_utc + timedelta(days=1)).strftime("%Y-%m-%d %H:%M"),
            "section_ids": [self.sec_a.id]
        }
        resp = client.post("/assignments", json=payload, headers={"Authorization": f"Bearer {self.student_a_token}"})
        self.assertEqual(resp.status_code, 403)

    def test_07_assignment_visibility_scoped_to_assigned_section(self):
        """Student A (CSE-A) sees the assignment; Student B (AIML-A) does not."""
        assign_id = getattr(TestAssignmentAndHighlighting, "created_assign_id", None)
        self.assertIsNotNone(assign_id)

        # Student A (CSE-A)
        resp_a = client.get("/assignments", headers={"Authorization": f"Bearer {self.student_a_token}"})
        self.assertEqual(resp_a.status_code, 200)
        titles_a = [a["title"] for a in resp_a.json()]
        self.assertIn("Software Engineering Lab 3", titles_a)

        # Student B (AIML-A) - should not see it
        resp_b = client.get("/assignments", headers={"Authorization": f"Bearer {self.student_b_token}"})
        self.assertEqual(resp_b.status_code, 200)
        titles_b = [a["title"] for a in resp_b.json()]
        self.assertNotIn("Software Engineering Lab 3", titles_b)

    def test_08_assignment_analytics_from_db(self):
        """GET /assignments/{id}/analytics computes real-time statistics from DB."""
        assign_id = getattr(TestAssignmentAndHighlighting, "created_assign_id", None)
        self.assertIsNotNone(assign_id)

        resp = client.get(f"/assignments/{assign_id}/analytics", headers={"Authorization": f"Bearer {self.faculty_token}"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["assignment_id"], assign_id)
        self.assertIn("total_eligible_students", data)
        self.assertIn("total_submissions", data)
        self.assertIn("completion_rate", data)
        self.assertIn("flagged_similarity_count", data)

    def test_09_assignment_deadline_enforcement_rejected_when_late_disabled(self):
        """Submissions past deadline are rejected with 400 when allow_late_submissions is False."""
        # Create an expired assignment with allow_late_submissions=False
        now_utc = datetime.now(timezone.utc)
        past_start = (now_utc - timedelta(days=2)).strftime("%Y-%m-%d %H:%M")
        past_due = (now_utc - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M")
        
        payload = {
            "title": "Strict Expired Assignment",
            "subject": "CS999",
            "start_date": past_start,
            "due_date": past_due,
            "section_ids": [self.sec_a.id],
            "allow_late_submissions": False,
            "status": "Active"
        }
        res = client.post("/assignments", json=payload, headers={"Authorization": f"Bearer {self.faculty_token}"})
        self.assertEqual(res.status_code, 200)
        strict_id = res.json()["assignment_id"]

        # Attempt to upload
        file_content = b"%PDF-1.4\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF"
        files = {"file": ("test_submission.pdf", io.BytesIO(file_content), "application/pdf")}
        data = {"assignment_id": str(strict_id), "section_name": "CSE-A"}

        sub_resp = client.post("/upload", files=files, data=data, headers={"Authorization": f"Bearer {self.student_a_token}"})
        self.assertEqual(sub_resp.status_code, 400)
        self.assertIn("deadline has passed", sub_resp.json()["detail"].lower())

    def test_10_assignment_late_submission_accepted_when_allowed(self):
        """Submissions past deadline are accepted and marked is_late=True when allow_late_submissions is True."""
        now_utc = datetime.now(timezone.utc)
        past_start = (now_utc - timedelta(days=2)).strftime("%Y-%m-%d %H:%M")
        past_due = (now_utc - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M")
        
        payload = {
            "title": "Late-Permitted Assignment",
            "subject": "CS998",
            "start_date": past_start,
            "due_date": past_due,
            "section_ids": [self.sec_a.id],
            "allow_late_submissions": True,
            "status": "Active"
        }
        res = client.post("/assignments", json=payload, headers={"Authorization": f"Bearer {self.faculty_token}"})
        self.assertEqual(res.status_code, 200)
        late_id = res.json()["assignment_id"]

        # Attempt upload with valid PDF
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 100), "This is a valid late submission for testing purposes.")
        pdf_bytes = doc.tobytes()
        doc.close()
        files = {"file": ("late_sub.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        data = {"assignment_id": str(late_id), "section_name": "CSE-A"}

        sub_resp = client.post("/upload", files=files, data=data, headers={"Authorization": f"Bearer {self.student_a_token}"})
        self.assertEqual(sub_resp.status_code, 200)
        
        # Verify in DB that is_late is True
        up_record = self.db.query(models.Upload).filter(
            models.Upload.user_id == self.student_a.id,
            models.Upload.assignment_id == late_id
        ).first()
        self.assertIsNotNone(up_record)
        self.assertTrue(up_record.is_late, "Submission past deadline must have is_late=True")

if __name__ == "__main__":
    unittest.main()
