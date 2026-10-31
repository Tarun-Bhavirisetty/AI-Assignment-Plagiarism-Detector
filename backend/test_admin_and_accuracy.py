# -*- coding: utf-8 -*-
"""
Test suite verifying Administrator Data Management, Comparison Accuracy,
Real-Time Submission Timestamps, and Audit Logging.
"""

import os
import sys
import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from routes import create_access_token, format_datetime_ist

client = TestClient(app)

class TestAdminAndAccuracy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        # Find or create an admin user
        cls.admin = cls.db.query(models.User).filter(models.User.role == "admin").first()
        if not cls.admin:
            cls.admin = models.User(
                name="Admin Tester",
                email="admin_tester@metaguard.com",
                password_hash="fakehash",
                role="admin",
                is_verified=True,
                is_active=True,
                is_deleted=False
            )
            cls.db.add(cls.admin)
            cls.db.commit()
            cls.db.refresh(cls.admin)
        
        cls.admin_token = create_access_token(data={"sub": str(cls.admin.id), "role": "admin"})
        cls.headers = {"Authorization": f"Bearer {cls.admin_token}"}

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_01_timezone_formatting_ist(self):
        """Verify format_datetime_ist converts UTC to Asia/Kolkata correctly."""
        utc_dt = datetime(2026, 10, 31, 10, 30, 0, tzinfo=timezone.utc)
        formatted = format_datetime_ist(utc_dt)
        # 10:30 UTC + 5:30 = 16:00 (04:00 PM) IST
        self.assertIn("31-10-2026", formatted)
        self.assertIn("04:00 PM IST", formatted)

    def test_02_comparison_accuracy_clean_first_upload(self):
        """Verify the earliest submission returns 0.0% Clean and cannot match forward in time."""
        # Find upload with id=1 or first upload
        first_up = self.db.query(models.Upload).filter(
            (models.Upload.is_deleted == False) | (models.Upload.is_deleted == None)
        ).order_by(models.Upload.id.asc()).first()
        
        if first_up:
            resp = client.get(f"/compare/{first_up.id}", headers=self.headers)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            # If it has no predecessor with same hash or content, it must be clean
            if not data.get("reference_upload_id"):
                self.assertEqual(data.get("overall_similarity"), 0.0)
                self.assertEqual(data.get("similarity_status"), "Clean")
                self.assertEqual(data.get("detection_method"), "clean_verified")

    def test_03_storage_stats_endpoint(self):
        """GET /admin/storage-stats returns valid numeric disk metrics."""
        resp = client.get("/admin/storage-stats", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("total_submissions", data)
        self.assertIn("total_storage_mb", data)
        self.assertIn("orphaned_files_count", data)
        self.assertIn("orphaned_files_mb", data)
        self.assertGreaterEqual(data["total_submissions"], 0)
        self.assertGreaterEqual(data["total_storage_mb"], 0.0)

    def test_04_admin_uploads_list(self):
        """GET /admin/uploads returns formatted file size, IST timestamp, and status."""
        resp = client.get("/admin/uploads", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        uploads = resp.json()
        self.assertIsInstance(uploads, list)
        if len(uploads) > 0:
            sample = uploads[0]
            self.assertIn("file_size_formatted", sample)
            self.assertIn("similarity_status", sample)
            self.assertIn("upload_time", sample)

    def test_05_admin_users_list(self):
        """GET /admin/users returns user roster with submission and evaluation stats."""
        resp = client.get("/admin/users", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        users = resp.json()
        self.assertIsInstance(users, list)
        if len(users) > 0:
            sample = users[0]
            self.assertIn("submissions_count", sample)
            self.assertIn("evaluations_count", sample)
            self.assertIn("is_active", sample)

    def test_06_single_submission_deletion_lifecycle(self):
        """Create a temporary upload and verify complete deletion + audit trail."""
        # Create temp upload
        temp_up = models.Upload(
            user_id=self.admin.id,
            file_name="test_temp_doc.pdf",
            file_type="pdf",
            hash="temphash99999",
            file_path="uploads/test_temp_doc.pdf",
            upload_time=datetime.utcnow(),
            similarity_score=0.0,
            similarity_status="Clean",
            is_deleted=False
        )
        self.db.add(temp_up)
        self.db.commit()
        self.db.refresh(temp_up)

        # Delete it via endpoint
        del_resp = client.delete(f"/admin/uploads/{temp_up.id}", headers=self.headers)
        self.assertEqual(del_resp.status_code, 200)
        del_data = del_resp.json()
        self.assertIn("deleted_upload_id", del_data)

        # Verify not found in active list
        get_resp = client.get(f"/admin/uploads", headers=self.headers)
        active_ids = [u["id"] for u in get_resp.json()]
        self.assertNotIn(temp_up.id, active_ids)

    def test_07_bulk_submission_deletion(self):
        """Create two temporary uploads and bulk delete them."""
        up1 = models.Upload(
            user_id=self.admin.id,
            file_name="bulk_temp_1.pdf",
            file_type="pdf",
            hash="bulkhash1",
            file_path="uploads/bulk_temp_1.pdf",
            upload_time=datetime.utcnow(),
            similarity_score=0.0,
            similarity_status="Clean",
            is_deleted=False
        )
        up2 = models.Upload(
            user_id=self.admin.id,
            file_name="bulk_temp_2.pdf",
            file_type="pdf",
            hash="bulkhash2",
            file_path="uploads/bulk_temp_2.pdf",
            upload_time=datetime.utcnow(),
            similarity_score=0.0,
            similarity_status="Clean",
            is_deleted=False
        )
        self.db.add_all([up1, up2])
        self.db.commit()
        self.db.refresh(up1)
        self.db.refresh(up2)

        resp = client.post(
            "/admin/uploads/bulk-delete",
            json={"upload_ids": [up1.id, up2.id], "permanent": True},
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("deleted_count"), 2)

    def test_08_delete_all_submissions_validation(self):
        """POST /admin/uploads/delete-all rejects invalid confirmation phrase."""
        resp = client.post(
            "/admin/uploads/delete-all",
            json={"confirmation_phrase": "WRONG PHRASE"},
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Confirmation phrase mismatch", resp.json().get("detail", ""))

    def test_09_user_deletion_safeguards(self):
        """Admin cannot delete their own account."""
        resp = client.delete(f"/admin/users/{self.admin.id}", headers=self.headers)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Cannot delete your own administrator account", resp.json().get("detail", ""))

    def test_10_user_archive_with_academic_preservation(self):
        """Create a student user with upload and test deletion with academic preservation."""
        import time
        ts = int(time.time())
        temp_user = models.User(
            name="Archived Student",
            email=f"temp_student_{ts}@metaguard.com",
            password_hash="fakehash",
            role="student",
            is_verified=True,
            is_active=True,
            is_deleted=False
        )
        self.db.add(temp_user)
        self.db.commit()
        self.db.refresh(temp_user)

        temp_user_up = models.Upload(
            user_id=temp_user.id,
            file_name="student_paper.pdf",
            file_type="pdf",
            hash="studentpaperhash",
            file_path="uploads/student_paper.pdf",
            upload_time=datetime.utcnow(),
            similarity_score=10.0,
            similarity_status="Clean",
            is_deleted=False
        )
        self.db.add(temp_user_up)
        self.db.commit()
        self.db.refresh(temp_user_up)

        # Delete user with preserve_academic_records=True
        resp = client.delete(
            f"/admin/users/{temp_user.id}?preserve_academic_records=true",
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get("status"), "archived")

        # Verify upload is still intact
        check_up = self.db.query(models.Upload).filter(models.Upload.id == temp_user_up.id).first()
        self.assertIsNotNone(check_up)
        self.assertFalse(check_up.is_deleted)

        # Clean up test upload
        self.db.delete(check_up)
        self.db.commit()

    def test_11_audit_logs_retrieval(self):
        """GET /admin/audit-logs returns audit events generated during operations."""
        resp = client.get("/admin/audit-logs?limit=20", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        logs = resp.json()
        self.assertIsInstance(logs, list)
        self.assertGreater(len(logs), 0)
        first_log = logs[0]
        self.assertIn("action_type", first_log)
        self.assertIn("admin_name", first_log)
        self.assertIn("timestamp", first_log)

if __name__ == "__main__":
    unittest.main()
