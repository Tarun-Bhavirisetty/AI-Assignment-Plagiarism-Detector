import os
import sys
import unittest
from unittest.mock import patch, MagicMock
import smtplib

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from email_service import (
    get_smtp_config, validate_smtp_config, is_dev_mode,
    send_verification_email, generate_verification_token, verify_smtp_connection
)
from routes import create_access_token

client = TestClient(app)

class TestGmailSmtpWorkflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.cleanup_emails = []

    @classmethod
    def tearDownClass(cls):
        for email in cls.cleanup_emails:
            cls.db.query(models.User).filter(models.User.email == email).delete()
        cls.db.commit()
        cls.db.close()

    def test_01_smtp_config_validation(self):
        # 1. Missing credentials
        with patch.dict(os.environ, {"SMTP_USERNAME": "", "SMTP_USER": "", "SMTP_PASSWORD": ""}):
            is_valid, msg = validate_smtp_config()
            self.assertFalse(is_valid)
            self.assertIn("username", msg.lower())

        # 2. Missing password
        with patch.dict(os.environ, {"SMTP_USERNAME": "test@gmail.com", "SMTP_PASSWORD": ""}):
            is_valid, msg = validate_smtp_config()
            self.assertFalse(is_valid)
            self.assertIn("password", msg.lower())

        # 3. Invalid port
        with patch.dict(os.environ, {"SMTP_USERNAME": "test@gmail.com", "SMTP_PASSWORD": "password", "SMTP_PORT": "999"}):
            is_valid, msg = validate_smtp_config()
            self.assertFalse(is_valid)
            self.assertIn("port", msg.lower())

        # 4. Valid configuration
        with patch.dict(os.environ, {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "verified_sender@gmail.com",
            "SMTP_PASSWORD": "abcd efgh ijkl mnop",
            "SMTP_FROM_EMAIL": "MetaGuard <verified_sender@gmail.com>"
        }):
            is_valid, msg = validate_smtp_config()
            self.assertTrue(is_valid)
            cfg = get_smtp_config()
            # Spaces should be automatically stripped for 16-char app passwords
            self.assertEqual(cfg["password"], "abcdefghijklmnop")
            self.assertEqual(cfg["user"], "verified_sender@gmail.com")
            self.assertEqual(cfg["host"], "smtp.gmail.com")
            self.assertEqual(cfg["port"], 587)

    def test_02_production_mode_strictly_hides_verification_links(self):
        with patch.dict(os.environ, {
            "ENVIRONMENT": "production",
            "SMTP_USERNAME": "",
            "SMTP_PASSWORD": ""
        }):
            self.assertFalse(is_dev_mode())
            raw_token, _, _ = generate_verification_token()
            res = send_verification_email("student@university.edu", "Prod Student", raw_token)
            self.assertFalse(res["sent"])
            # verification_url MUST BE NONE IN PRODUCTION!
            self.assertIsNone(res["verification_url"])
            self.assertNotIn("token=", res.get("message", ""))

    def test_03_development_mode_provides_direct_link_when_unconfigured(self):
        with patch.dict(os.environ, {
            "ENVIRONMENT": "development",
            "ALLOW_DEV_VERIFICATION_LINK": "true",
            "SMTP_USERNAME": "",
            "SMTP_PASSWORD": ""
        }):
            self.assertTrue(is_dev_mode())
            raw_token, _, _ = generate_verification_token()
            res = send_verification_email("student@university.edu", "Dev Student", raw_token)
            self.assertFalse(res["sent"])
            self.assertIsNotNone(res["verification_url"])
            self.assertIn("token=", res["verification_url"])

    def test_04_smtp_authentication_failure_handled_safely(self):
        with patch.dict(os.environ, {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "invalid_user@gmail.com",
            "SMTP_PASSWORD": "wrongpassword1234",
            "ENVIRONMENT": "production"
        }):
            with patch("smtplib.SMTP") as mock_smtp:
                instance = mock_smtp.return_value
                instance.starttls.return_value = None
                instance.login.side_effect = smtplib.SMTPAuthenticationError(535, b"Authentication Failed")
                
                raw_token, _, _ = generate_verification_token()
                res = send_verification_email("test@university.edu", "Auth Test", raw_token)
                self.assertFalse(res["sent"])
                self.assertEqual(res["method"], "auth_error")
                self.assertIsNone(res["verification_url"])

    def test_05_smtp_successful_transmission(self):
        with patch.dict(os.environ, {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "test_sender@gmail.com",
            "SMTP_PASSWORD": "valid_google_app_pw",
            "ENVIRONMENT": "development"
        }):
            with patch("smtplib.SMTP") as mock_smtp:
                instance = mock_smtp.return_value
                instance.starttls.return_value = None
                instance.login.return_value = None
                instance.sendmail.return_value = {}

                raw_token, _, _ = generate_verification_token()
                res = send_verification_email("student@university.edu", "Test Student", raw_token)
                self.assertTrue(res["sent"])
                self.assertEqual(res["method"], "smtp")
                self.assertIsNone(res["verification_url"])
                self.assertIn("successfully", res["message"].lower())
                instance.sendmail.assert_called_once()

    def test_06_admin_smtp_status_endpoint(self):
        admin_login = client.post("/login", json={"email": "admin@metaguard.com", "password": "admin123"})
        self.assertEqual(admin_login.status_code, 200)
        admin_token = admin_login.json()["access_token"]

        res = client.get("/admin/smtp-status", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("configured", data)
        self.assertIn("host", data)
        self.assertIn("port", data)
        self.assertNotIn("password", data) # Never exposes password

        # Student cannot access admin smtp status
        student_token = create_access_token({"sub": "4", "role": "student"})
        forbidden_res = client.get("/admin/smtp-status", headers={"Authorization": f"Bearer {student_token}"})
        self.assertEqual(forbidden_res.status_code, 403)

if __name__ == "__main__":
    unittest.main()
