import os
import sys
import unittest

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models

client = TestClient(app)

class TestRolesAndWorkflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_01_legacy_admin_login(self):
        res = client.post("/login", json={"email": "admin@metaguard.com", "password": "admin123"})
        self.assertEqual(res.status_code, 200, f"Admin login failed: {res.text}")
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["role"], "admin")

    def test_02_legacy_user_login(self):
        # Legacy user: abcd@gmail.com
        user = self.db.query(models.User).filter(models.User.email == "abcd@gmail.com").first()
        self.assertIsNotNone(user)
        self.assertTrue(user.is_verified)
        self.assertEqual(user.role, "user") # Will normalize to "student"

    def test_03_student_registration_and_verification(self):
        test_email = "new_student_test@metaguard.edu"
        test_reg = "REG-TEST-001"
        
        # Cleanup if exists from previous test
        existing = self.db.query(models.User).filter(models.User.email == test_email).first()
        if existing:
            self.db.delete(existing)
            self.db.commit()

        # 1. Signup
        signup_payload = {
            "name": "Jane Student",
            "email": test_email,
            "registration_number": test_reg,
            "password": "Password123",
            "confirm_password": "Password123",
            "department": "Computer Science"
        }
        res = client.post("/signup", json=signup_payload)
        self.assertEqual(res.status_code, 200, f"Signup failed: {res.text}")
        signup_data = res.json()
        self.assertTrue(signup_data["success"])
        self.assertFalse(signup_data["is_verified"])

        # 2. Attempt login before verification -> Should fail 403
        login_res = client.post("/login", json={"email": test_email, "password": "Password123"})
        self.assertEqual(login_res.status_code, 403, "Login should be forbidden for unverified account")

        # 3. Retrieve token hash from DB and test invalid token
        user = self.db.query(models.User).filter(models.User.email == test_email).first()
        self.assertIsNotNone(user)
        self.assertIsNotNone(user.verification_token)

        bad_verify = client.post("/verify-email", json={"token": "invalid_token_123"})
        self.assertEqual(bad_verify.status_code, 400)

        # 4. Verify using a known raw token with matching hash
        import hashlib
        raw_token = "test_workflow_token_12345"
        user.verification_token = hashlib.sha256(raw_token.encode()).hexdigest()
        self.db.commit()

        verify_res = client.post("/verify-email", json={"token": raw_token})
        self.assertEqual(verify_res.status_code, 200, f"Verification failed: {verify_res.text}")

        # 5. Now login must succeed
        login_res2 = client.post("/login", json={"email": test_email, "password": "Password123"})
        self.assertEqual(login_res2.status_code, 200, f"Login failed after verification: {login_res2.text}")
        student_data = login_res2.json()
        self.assertEqual(student_data["role"], "student")
        student_token = student_data["access_token"]

        # 6. Student cannot access admin endpoints
        admin_res = client.get("/admin/users", headers={"Authorization": f"Bearer {student_token}"})
        self.assertEqual(admin_res.status_code, 403)

        # 7. Student cannot access evaluator submissions
        eval_res = client.get("/evaluator/submissions", headers={"Authorization": f"Bearer {student_token}"})
        self.assertEqual(eval_res.status_code, 403)

        # 8. Student cannot access HOD analytics
        hod_res = client.get("/hod/analytics", headers={"Authorization": f"Bearer {student_token}"})
        self.assertEqual(hod_res.status_code, 403)

    def test_04_evaluator_and_hod_assignment_workflow(self):
        # 1. Admin login
        admin_login = client.post("/login", json={"email": "admin@metaguard.com", "password": "admin123"})
        admin_token = admin_login.json()["access_token"]

        # 2. Create evaluator and HOD users if not present
        eval_email = "evaluator_test@metaguard.edu"
        hod_email = "hod_test@metaguard.edu"

        for em, role, name in [(eval_email, "evaluator", "Prof. Smith"), (hod_email, "hod", "Dr. Johnson")]:
            u = self.db.query(models.User).filter(models.User.email == em).first()
            if not u:
                u = models.User(
                    name=name,
                    email=em,
                    password_hash=models.User.__table__.columns.password_hash.type.python_type(),
                    role=role,
                    is_verified=True,
                    department="Computer Science"
                )
                from routes import get_password_hash
                u.password_hash = get_password_hash("Password123")
                self.db.add(u)
                self.db.commit()
            else:
                u.role = role
                u.is_verified = True
                self.db.commit()

        evaluator = self.db.query(models.User).filter(models.User.email == eval_email).first()
        hod = self.db.query(models.User).filter(models.User.email == hod_email).first()

        # 3. Ensure a section exists
        section = self.db.query(models.Section).first()
        if not section:
            section = models.Section(name="SEC-A", department="Computer Science")
            self.db.add(section)
            self.db.commit()

        # 4. Assign evaluator to section
        assign_res = client.post(
            "/evaluator-sections",
            json={"evaluator_id": evaluator.id, "section_id": section.id},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        self.assertIn(assign_res.status_code, [200, 400]) # 400 if already assigned

        # 5. Evaluator login
        eval_login = client.post("/login", json={"email": eval_email, "password": "Password123"})
        self.assertEqual(eval_login.status_code, 200)
        eval_token = eval_login.json()["access_token"]
        self.assertEqual(eval_login.json()["role"], "evaluator")

        # 6. Evaluator sees submissions for assigned section
        subs_res = client.get("/evaluator/submissions", headers={"Authorization": f"Bearer {eval_token}"})
        self.assertEqual(subs_res.status_code, 200)
        subs = subs_res.json()
        print(f"Evaluator submissions count: {len(subs)}")

        # 7. Evaluator evaluates a dedicated test submission and cleans it up
        test_student = self.db.query(models.User).filter(models.User.email == "new_student_test@metaguard.edu").first()
        test_upload = models.Upload(
            user_id=test_student.id if test_student else evaluator.id,
            file_name="test_assignment_eval.pdf",
            file_type="application/pdf",
            hash="test_eval_dummy_hash_123",
            file_path="uploads/test_assignment_eval.pdf",
            section_name="SEC-A",
            assignment_title="Workflow Test Assignment"
        )
        self.db.add(test_upload)
        self.db.commit()
        self.db.refresh(test_upload)
        target_upload_id = test_upload.id

        try:
            eval_post = client.post(
                f"/evaluations/{target_upload_id}",
                json={
                    "marks": 88.5,
                    "max_marks": 100.0,
                    "status": "Evaluation Completed",
                    "decision": "Cleared",
                    "comments": "Good analytical depth and clean presentation."
                },
                headers={"Authorization": f"Bearer {eval_token}"}
            )
            self.assertEqual(eval_post.status_code, 200)
            self.assertTrue(eval_post.json()["success"])

            # Verify evaluation retrieval
            eval_get = client.get(f"/evaluations/{target_upload_id}", headers={"Authorization": f"Bearer {eval_token}"})
            self.assertEqual(eval_get.status_code, 200)
            self.assertEqual(eval_get.json()["marks"], 88.5)
            self.assertEqual(eval_get.json()["status"], "Evaluation Completed")
        finally:
            # Clean up test evaluation and test upload so real student data is never affected
            self.db.query(models.Evaluation).filter(models.Evaluation.upload_id == target_upload_id).delete()
            self.db.query(models.Upload).filter(models.Upload.id == target_upload_id).delete()
            self.db.commit()

        # 8. HOD login and view analytics
        hod_login = client.post("/login", json={"email": hod_email, "password": "Password123"})
        self.assertEqual(hod_login.status_code, 200)
        hod_token = hod_login.json()["access_token"]
        self.assertEqual(hod_login.json()["role"], "hod")

        hod_analytics = client.get("/hod/analytics", headers={"Authorization": f"Bearer {hod_token}"})
        self.assertEqual(hod_analytics.status_code, 200)
        analytics_data = hod_analytics.json()
        self.assertEqual(analytics_data["department"], "Computer Science")
        self.assertIn("section_stats", analytics_data)
        self.assertIn("evaluator_workload", analytics_data)
        print("HOD Analytics department:", analytics_data["department"])
        print("HOD total submissions:", analytics_data["total_submissions"])

if __name__ == "__main__":
    unittest.main()
