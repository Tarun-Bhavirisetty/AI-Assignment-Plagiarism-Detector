import os
import sys
import unittest
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from routes import get_password_hash, create_access_token

client = TestClient(app)

class TestRegistrationAndAcademicMarks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.cleanup_users = []
        cls.cleanup_uploads = []
        cls.cleanup_evaluations = []

    @classmethod
    def tearDownClass(cls):
        # Clean up any test records created during testing
        for eval_id in cls.cleanup_evaluations:
            cls.db.query(models.Evaluation).filter(models.Evaluation.id == eval_id).delete()
        for upload_id in cls.cleanup_uploads:
            cls.db.query(models.Evaluation).filter(models.Evaluation.upload_id == upload_id).delete()
            cls.db.query(models.Upload).filter(models.Upload.id == upload_id).delete()
        for email in cls.cleanup_users:
            u = cls.db.query(models.User).filter(models.User.email == email).first()
            if u:
                cls.db.query(models.Evaluation).filter(models.Evaluation.evaluator_id == u.id).delete()
                cls.db.delete(u)
        cls.db.commit()
        cls.db.close()

    # ---------------------------------------------------------
    # PART 1: REGISTRATION TESTS
    # ---------------------------------------------------------

    def test_01_empty_required_fields_rejected(self):
        # Empty name
        r1 = client.post("/signup", json={
            "name": "", "registration_number": "REG-TEST-1", "email": "reg1@metaguard.edu",
            "password": "Password123", "confirm_password": "Password123"
        })
        self.assertEqual(r1.status_code, 400)
        self.assertIn("Full Name", r1.json()["detail"])

        # Empty registration number
        r2 = client.post("/signup", json={
            "name": "Test Student", "registration_number": "", "email": "reg2@metaguard.edu",
            "password": "Password123", "confirm_password": "Password123"
        })
        self.assertEqual(r2.status_code, 400)
        self.assertIn("Registration Number", r2.json()["detail"])

        # Empty email
        r3 = client.post("/signup", json={
            "name": "Test Student", "registration_number": "REG-TEST-3", "email": "",
            "password": "Password123", "confirm_password": "Password123"
        })
        self.assertEqual(r3.status_code, 400)

        # Empty password
        r4 = client.post("/signup", json={
            "name": "Test Student", "registration_number": "REG-TEST-4", "email": "reg4@metaguard.edu",
            "password": "", "confirm_password": ""
        })
        self.assertEqual(r4.status_code, 400)

    def test_02_invalid_email_rejected(self):
        res = client.post("/signup", json={
            "name": "Invalid Email Student", "registration_number": "REG-INV-EMAIL",
            "email": "not-a-valid-email", "password": "Password123", "confirm_password": "Password123"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid email format", res.json()["detail"])

    def test_03_short_password_rejected(self):
        res = client.post("/signup", json={
            "name": "Short Pass Student", "registration_number": "REG-SHORT-PASS",
            "email": "shortpass@metaguard.edu", "password": "123", "confirm_password": "123"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("at least 6 characters", res.json()["detail"])

    def test_04_password_mismatch_rejected(self):
        res = client.post("/signup", json={
            "name": "Mismatch Student", "registration_number": "REG-MISMATCH",
            "email": "mismatch@metaguard.edu", "password": "Password123", "confirm_password": "DifferentPassword123"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("Passwords do not match", res.json()["detail"])

    def test_05_successful_registration_creates_pending_account(self):
        test_email = "student_verify_flow@metaguard.edu"
        test_reg = "REG-FLOW-001"
        self.cleanup_users.append(test_email)

        # Ensure not in DB
        self.db.query(models.User).filter(models.User.email == test_email).delete()
        self.db.commit()

        res = client.post("/signup", json={
            "name": "Verify Flow Student",
            "registration_number": test_reg,
            "email": test_email,
            "password": "SecurePassword123!",
            "confirm_password": "SecurePassword123!"
        })
        self.assertEqual(res.status_code, 200, f"Signup failed: {res.text}")
        data = res.json()
        self.assertTrue(data["success"])
        self.assertFalse(data["is_verified"])
        self.assertIn("verification_url", data) # Returned for local/free-tier testing

        # Check DB record
        u = self.db.query(models.User).filter(models.User.email == test_email).first()
        self.assertIsNotNone(u)
        self.assertFalse(u.is_verified)
        self.assertEqual(u.role, "student")
        self.assertEqual(u.registration_number, test_reg)
        self.assertIsNotNone(u.verification_token)
        self.assertIsNotNone(u.verification_token_expires)

    def test_06_duplicate_email_and_reg_number_handled(self):
        # Using the account created in test_05
        test_email = "student_verify_flow@metaguard.edu"
        test_reg = "REG-FLOW-001"

        # Duplicate email
        dup_email_res = client.post("/signup", json={
            "name": "Duplicate Student", "registration_number": "REG-UNIQUE-999",
            "email": test_email, "password": "Password123", "confirm_password": "Password123"
        })
        self.assertEqual(dup_email_res.status_code, 400)
        self.assertIn("Email already registered", dup_email_res.json()["detail"])

        # Duplicate registration number
        dup_reg_res = client.post("/signup", json={
            "name": "Duplicate Student", "registration_number": test_reg,
            "email": "another_unique@metaguard.edu", "password": "Password123", "confirm_password": "Password123"
        })
        self.assertEqual(dup_reg_res.status_code, 400)
        self.assertIn("Registration number already registered", dup_reg_res.json()["detail"])

    # ---------------------------------------------------------
    # PART 2: EMAIL VERIFICATION TESTS
    # ---------------------------------------------------------

    def test_07_unverified_student_cannot_login_or_bypass(self):
        test_email = "student_verify_flow@metaguard.edu"
        # 1. Login fails with 403
        login_res = client.post("/login", json={"email": test_email, "password": "SecurePassword123!"})
        self.assertEqual(login_res.status_code, 403)
        self.assertIn("Email not verified", login_res.json()["detail"])

        # 2. Forged/Direct token for unverified user fails protected endpoints
        u = self.db.query(models.User).filter(models.User.email == test_email).first()
        fake_token = create_access_token({"sub": str(u.id), "role": "student"})
        protected_res = client.get("/uploads", headers={"Authorization": f"Bearer {fake_token}"})
        self.assertEqual(protected_res.status_code, 403)
        self.assertIn("Email not verified", protected_res.json()["detail"])

    def test_08_invalid_and_expired_verification_tokens_rejected(self):
        # 1. Invalid token
        inv_res = client.post("/verify-email", json={"token": "completely_fake_token_xyz"})
        self.assertEqual(inv_res.status_code, 400)
        self.assertIn("Invalid or already used", inv_res.json()["detail"])

        # 2. Expired token simulation
        test_email = "expired_token_student@metaguard.edu"
        self.cleanup_users.append(test_email)
        self.db.query(models.User).filter(models.User.email == test_email).delete()
        self.db.commit()

        import hashlib
        raw_token = "expired_raw_token_123"
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expired_user = models.User(
            name="Expired Student",
            email=test_email,
            password_hash=get_password_hash("Password123"),
            role="student",
            registration_number="REG-EXP-001",
            is_verified=False,
            verification_token=token_hash,
            verification_token_expires=datetime.utcnow() - timedelta(hours=1) # Already expired 1 hour ago
        )
        self.db.add(expired_user)
        self.db.commit()

        exp_res = client.post("/verify-email", json={"token": raw_token})
        self.assertEqual(exp_res.status_code, 400)
        self.assertIn("expired", exp_res.json()["detail"].lower())

    def test_09_successful_verification_activates_login(self):
        # Retrieve the signup response verification_url for student_verify_flow
        test_email = "student_verify_flow@metaguard.edu"
        u = self.db.query(models.User).filter(models.User.email == test_email).first()
        self.assertIsNotNone(u)

        # Generate a known raw token and hash to simulate real link click
        import hashlib
        raw_tok = "test_valid_raw_token_xyz_789"
        u.verification_token = hashlib.sha256(raw_tok.encode()).hexdigest()
        u.verification_token_expires = datetime.utcnow() + timedelta(hours=24)
        self.db.commit()

        # Call verify-email
        v_res = client.post("/verify-email", json={"token": raw_tok})
        self.assertEqual(v_res.status_code, 200)
        self.assertTrue(v_res.json()["success"])

        # DB user is now verified, token cleared
        self.db.refresh(u)
        self.assertTrue(u.is_verified)
        self.assertIsNone(u.verification_token)
        self.assertIsNone(u.verification_token_expires)

        # Login now succeeds
        login_res = client.post("/login", json={"email": test_email, "password": "SecurePassword123!"})
        self.assertEqual(login_res.status_code, 200)
        self.assertIn("access_token", login_res.json())

        # Calling verify again with the same token fails (single-use)
        second_verify = client.post("/verify-email", json={"token": raw_tok})
        self.assertEqual(second_verify.status_code, 400)

    def test_10_resend_verification_rate_limiting(self):
        test_email = "student_resend_rate@metaguard.edu"
        self.cleanup_users.append(test_email)
        self.db.query(models.User).filter(models.User.email == test_email).delete()
        self.db.commit()

        client.post("/signup", json={
            "name": "Resend Rate Student",
            "registration_number": "REG-RESEND-001",
            "email": test_email,
            "password": "Password123",
            "confirm_password": "Password123"
        })

        # First resend succeeds
        r1 = client.post("/resend-verification", json={"email": test_email})
        self.assertEqual(r1.status_code, 200)

        # Immediate second resend triggers 429 Too Many Requests
        r2 = client.post("/resend-verification", json={"email": test_email})
        self.assertEqual(r2.status_code, 429)
        self.assertIn("Please wait", r2.json()["detail"])

    # ---------------------------------------------------------
    # PART 3: ACADEMIC MARKS & PLAGIARISM SEPARATION TESTS
    # ---------------------------------------------------------

    def test_11_student_submissions_un_evaluated_display_pending(self):
        # Student Tarun (user id 4)
        student_token = create_access_token({"sub": "4", "role": "student"})
        res = client.get("/uploads", headers={"Authorization": f"Bearer {student_token}"})
        self.assertEqual(res.status_code, 200)
        uploads = res.json()
        self.assertEqual(len(uploads), 8, f"Expected 8 student uploads, found {len(uploads)}")

        evaluated_count = sum(1 for u in uploads if u.get("evaluation_status") == "Evaluation Completed" and u.get("marks") is not None)
        pending_count = len(uploads) - evaluated_count

        self.assertEqual(evaluated_count, 0, "No uploads should have finalized evaluation marks")
        self.assertEqual(pending_count, 8, "All 8 uploads should be pending evaluation")

        for u in uploads:
            self.assertEqual(u["evaluation_status"], "Pending Review")
            self.assertIsNone(u["marks"], f"Upload {u['id']} has marks but was never evaluated by an instructor")
            self.assertIsNone(u["comments"])
            self.assertIsNone(u["decision"])

    def test_12_plagiarism_similarity_does_not_become_marks(self):
        student_token = create_access_token({"sub": "4", "role": "student"})
        res = client.get("/uploads", headers={"Authorization": f"Bearer {student_token}"})
        self.assertEqual(res.status_code, 200)
        uploads = res.json()

        # Find upload 12 ('Another hiring')
        up12 = next((u for u in uploads if u["id"] == 12), None)
        self.assertIsNotNone(up12, "Upload ID 12 not found")
        self.assertEqual(up12["assignment_title"], "Another hiring")
        
        # Plagiarism score is 100.0%
        self.assertEqual(up12["similarity_score"], 100.0)
        # But academic marks are NONE (Not yet evaluated)
        self.assertIsNone(up12["marks"])
        self.assertEqual(up12["evaluation_status"], "Pending Review")

        # Find upload 10 ('F') with 95.26% plagiarism
        up10 = next((u for u in uploads if u["id"] == 10), None)
        self.assertIsNotNone(up10)
        self.assertAlmostEqual(up10["similarity_score"], 95.26, places=1)
        self.assertIsNone(up10["marks"])
        self.assertEqual(up10["evaluation_status"], "Pending Review")

    def test_13_unauthorized_student_cannot_evaluate_submission(self):
        student_token = create_access_token({"sub": "4", "role": "student"})
        res = client.post("/evaluations/12", json={
            "marks": 99.0, "max_marks": 100.0, "status": "Evaluation Completed"
        }, headers={"Authorization": f"Bearer {student_token}"})
        self.assertEqual(res.status_code, 403, "Student must not be allowed to post evaluations")

    def test_14_marks_out_of_range_rejected(self):
        # Admin or Evaluator token
        admin_login = client.post("/login", json={"email": "admin@metaguard.com", "password": "admin123"})
        self.assertEqual(admin_login.status_code, 200)
        admin_token = admin_login.json()["access_token"]

        # Negative marks
        r_neg = client.post("/evaluations/12", json={
            "marks": -10.0, "max_marks": 100.0, "status": "Evaluation Completed"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(r_neg.status_code, 400)
        self.assertIn("Marks must be between 0", r_neg.json()["detail"])

        # Marks exceeding maximum
        r_exceed = client.post("/evaluations/12", json={
            "marks": 110.0, "max_marks": 100.0, "status": "Evaluation Completed"
        }, headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(r_exceed.status_code, 400)
        self.assertIn("Marks must be between 0", r_exceed.json()["detail"])

    def test_15_authorized_evaluation_workflow_and_clean_isolation(self):
        # Admin or Evaluator evaluates a dedicated test submission
        admin_login = client.post("/login", json={"email": "admin@metaguard.com", "password": "admin123"})
        admin_token = admin_login.json()["access_token"]

        # Create temporary test upload
        test_upload = models.Upload(
            user_id=4,
            file_name="temp_test_eval.pdf",
            file_type="application/pdf",
            hash="dummy_hash_test_eval_temp",
            file_path="uploads/temp_test_eval.pdf",
            section_name="SEC-A",
            assignment_title="Temporary Test Assignment"
        )
        self.db.add(test_upload)
        self.db.commit()
        self.db.refresh(test_upload)
        t_id = test_upload.id

        try:
            # 1. Post valid evaluation
            eval_res = client.post(f"/evaluations/{t_id}", json={
                "marks": 92.5,
                "max_marks": 100.0,
                "status": "Evaluation Completed",
                "decision": "Cleared",
                "comments": "Great structure and original content."
            }, headers={"Authorization": f"Bearer {admin_token}"})
            self.assertEqual(eval_res.status_code, 200)

            # 2. Student retrieves uploads -> this submission now shows Evaluation Completed and 92.5 marks
            student_token = create_access_token({"sub": "4", "role": "student"})
            student_res = client.get("/uploads", headers={"Authorization": f"Bearer {student_token}"})
            self.assertEqual(student_res.status_code, 200)
            all_up = student_res.json()
            evaled_up = next((u for u in all_up if u["id"] == t_id), None)
            self.assertIsNotNone(evaled_up)
            self.assertEqual(evaled_up["evaluation_status"], "Evaluation Completed")
            self.assertEqual(evaled_up["marks"], 92.5)
            self.assertEqual(evaled_up["comments"], "Great structure and original content.")

            # Evaluated count is now 1, pending is 8
            evaluated_count = sum(1 for u in all_up if u.get("evaluation_status") == "Evaluation Completed" and u.get("marks") is not None)
            self.assertEqual(evaluated_count, 1)
        finally:
            # Delete test evaluation and test upload so student data is returned clean
            self.db.query(models.Evaluation).filter(models.Evaluation.upload_id == t_id).delete()
            self.db.query(models.Upload).filter(models.Upload.id == t_id).delete()
            self.db.commit()

        # Verify clean state restored
        student_token = create_access_token({"sub": "4", "role": "student"})
        student_res2 = client.get("/uploads", headers={"Authorization": f"Bearer {student_token}"})
        all_up2 = student_res2.json()
        evaled_count2 = sum(1 for u in all_up2 if u.get("evaluation_status") == "Evaluation Completed" and u.get("marks") is not None)
        self.assertEqual(evaled_count2, 0)
        self.assertEqual(len(all_up2), 8)

    # ---------------------------------------------------------
    # PART 4: REGRESSION & COMPATIBILITY TESTS
    # ---------------------------------------------------------

    def test_16_legacy_admin_and_users_remain_functional(self):
        # Admin login
        admin_res = client.post("/login", json={"email": "admin@metaguard.com", "password": "admin123"})
        self.assertEqual(admin_res.status_code, 200)
        self.assertEqual(admin_res.json()["role"], "admin")

        # Admin analytics accessible
        admin_token = admin_res.json()["access_token"]
        analytics_res = client.get("/analytics", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(analytics_res.status_code, 200)
        self.assertIn("total_uploads", analytics_res.json())

if __name__ == "__main__":
    unittest.main()
