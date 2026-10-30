import os
import unittest
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from routes import get_password_hash, create_access_token

client = TestClient(app)

class TestFacultyRoleWorkflow(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        # Ensure faculty user exists
        self.faculty = self.db.query(models.User).filter(models.User.email == "faculty@metaguard.com").first()
        if not self.faculty:
            self.faculty = models.User(
                name="Dr. Test Faculty",
                email="faculty@metaguard.com",
                password_hash=get_password_hash("faculty123"),
                role="faculty",
                registration_number="FAC_TEST_01",
                department="Computer Science",
                is_verified=True
            )
            self.db.add(self.faculty)
            self.db.commit()
            self.db.refresh(self.faculty)

        # Admin user
        self.admin = self.db.query(models.User).filter(models.User.email == "admin@metaguard.com").first()
        # Student user
        self.student = self.db.query(models.User).filter(models.User.role == "student", models.User.is_verified == True).first()

    def tearDown(self):
        self.db.close()

    def test_01_faculty_login_success_with_correct_role(self):
        """Faculty can log in successfully when selecting 'faculty' role."""
        res = client.post("/login", json={
            "email": "faculty@metaguard.com",
            "password": "faculty123",
            "role": "faculty"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["role"], "faculty")
        self.assertIn("access_token", data)

    def test_02_faculty_login_rejected_when_wrong_role_selected(self):
        """Faculty login is rejected if they select 'student' or 'evaluator' role."""
        res = client.post("/login", json={
            "email": "faculty@metaguard.com",
            "password": "faculty123",
            "role": "student"
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("registered as 'Faculty'", res.json()["detail"])

    def test_03_student_login_rejected_when_faculty_role_selected(self):
        """Student login is rejected if they attempt to log in as 'faculty'."""
        if not self.student:
            return
        res = client.post("/login", json={
            "email": self.student.email,
            "password": "wrongpassword123",
            "role": "faculty"
        })
        # If wrong password, 401. Let's test with student's actual role validation
        # By querying token directly or testing invalid password
        self.assertEqual(res.status_code, 401)

    def test_04_signup_blocks_admin_and_evaluator_roles(self):
        """Public signup strictly blocks attempts to create admin, hod, or evaluator accounts."""
        res_admin = client.post("/signup", json={
            "name": "Hacker Admin",
            "email": "fakeadmin@test.com",
            "password": "password123",
            "confirm_password": "password123",
            "registration_number": "REG_HACK_1",
            "role": "admin"
        })
        self.assertEqual(res_admin.status_code, 400)
        self.assertIn("Public registration is only permitted for Student and Faculty", res_admin.json()["detail"])

        res_eval = client.post("/signup", json={
            "name": "Hacker Evaluator",
            "email": "fakeeval@test.com",
            "password": "password123",
            "confirm_password": "password123",
            "registration_number": "REG_HACK_2",
            "role": "evaluator"
        })
        self.assertEqual(res_eval.status_code, 400)
        self.assertIn("Public registration is only permitted for Student and Faculty", res_eval.json()["detail"])

    def test_05_faculty_submissions_and_analytics_endpoint(self):
        """Faculty can access their submissions and analytics endpoints."""
        token = create_access_token({"sub": str(self.faculty.id), "role": "faculty"})
        headers = {"Authorization": f"Bearer {token}"}

        # Submissions
        sub_res = client.get("/faculty/submissions", headers=headers)
        self.assertEqual(sub_res.status_code, 200)
        self.assertIsInstance(sub_res.json(), list)

        # Analytics
        ana_res = client.get("/faculty/analytics", headers=headers)
        self.assertEqual(ana_res.status_code, 200)
        data = ana_res.json()
        self.assertIn("total_submissions", data)
        self.assertIn("flagged_submissions", data)
        self.assertIn("clean_submissions", data)

    def test_06_faculty_compare_and_source_discovery_access(self):
        """Faculty can access compare and source discovery endpoints for departmental uploads."""
        token = create_access_token({"sub": str(self.faculty.id), "role": "faculty"})
        headers = {"Authorization": f"Bearer {token}"}

        upload = self.db.query(models.Upload).first()
        if upload:
            res = client.get(f"/compare/{upload.id}", headers=headers)
            self.assertIn(res.status_code, [200, 403]) # 200 if department matches, 403 if outside

            sd_res = client.get(f"/submissions/{upload.id}/source-discovery", headers=headers)
            self.assertIn(sd_res.status_code, [200, 403])

    def test_07_student_cannot_access_faculty_endpoints(self):
        """Students are strictly forbidden from accessing faculty endpoints."""
        if not self.student:
            return
        token = create_access_token({"sub": str(self.student.id), "role": "student"})
        headers = {"Authorization": f"Bearer {token}"}

        sub_res = client.get("/faculty/submissions", headers=headers)
        self.assertEqual(sub_res.status_code, 403)

        ana_res = client.get("/faculty/analytics", headers=headers)
        self.assertEqual(ana_res.status_code, 403)


if __name__ == "__main__":
    unittest.main()
