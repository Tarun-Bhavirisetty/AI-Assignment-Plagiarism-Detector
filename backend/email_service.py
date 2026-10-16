import os
import smtplib
import secrets
import hashlib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Ensure environment variables are loaded from backend/.env and project root .env
def load_env_files():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(backend_dir)
    load_dotenv(os.path.join(backend_dir, ".env"))
    load_dotenv(os.path.join(root_dir, ".env"))

load_env_files()

def get_smtp_config() -> dict:
    """
    Reads SMTP and environment configuration dynamically, supporting both standard
    and legacy environment variable names.
    """
    load_env_files()
    host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    port_str = os.getenv("SMTP_PORT", "587").strip()
    try:
        port = int(port_str)
    except ValueError:
        port = 587

    # Support both SMTP_USERNAME and SMTP_USER
    user = (os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER") or "").strip()

    # Support Google App Password (handles 16-character keys with or without spaces)
    raw_pass = (os.getenv("SMTP_PASSWORD") or "").strip()
    if " " in raw_pass and len(raw_pass.replace(" ", "")) == 16:
        password = raw_pass.replace(" ", "")
    else:
        password = raw_pass

    # Support both SMTP_FROM_EMAIL and SMTP_FROM
    from_email = (
        os.getenv("SMTP_FROM_EMAIL") or
        os.getenv("SMTP_FROM") or
        user or
        "noreply@metaguard.edu"
    ).strip()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
    environment = os.getenv("ENVIRONMENT", "development").strip().lower()
    allow_dev_links = os.getenv("ALLOW_DEV_VERIFICATION_LINK", "true").strip().lower()
    
    try:
        expire_hours = int(os.getenv("VERIFICATION_TOKEN_EXPIRE_HOURS", "24"))
    except ValueError:
        expire_hours = 24

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_email": from_email,
        "frontend_url": frontend_url,
        "environment": environment,
        "allow_dev_links": allow_dev_links,
        "expire_hours": expire_hours
    }

def is_dev_mode() -> bool:
    """
    Returns True only when running in non-production environments with dev links enabled.
    In production, this strictly evaluates to False to prevent exposing verification links.
    """
    cfg = get_smtp_config()
    if cfg["environment"] == "production":
        return False
    return cfg["allow_dev_links"] not in ["false", "0", "no"]

def validate_smtp_config() -> tuple[bool, str]:
    """
    Validates whether required SMTP settings are present and correctly formatted.
    Returns (is_valid, message).
    """
    cfg = get_smtp_config()
    if not cfg["host"]:
        return False, "SMTP host is missing (set SMTP_HOST, e.g., smtp.gmail.com)."
    if cfg["port"] not in [25, 465, 587]:
        return False, f"Invalid SMTP port: {cfg['port']}. Expected 587 (STARTTLS) or 465 (SSL)."
    if not cfg["user"]:
        return False, "SMTP username/email is not configured (set SMTP_USERNAME or SMTP_USER)."
    if not cfg["password"]:
        return False, "SMTP password is not configured (set SMTP_PASSWORD with a Google App Password)."
    return True, "SMTP configuration is valid."

def verify_smtp_connection() -> tuple[bool, str]:
    """
    Attempts connection and authentication with the configured SMTP server without sending an email.
    Never exposes passwords or sensitive keys in return messages.
    """
    is_valid, validation_msg = validate_smtp_config()
    if not is_valid:
        return False, validation_msg

    cfg = get_smtp_config()
    try:
        if cfg["port"] == 465:
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=15)
        else:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(cfg["user"], cfg["password"])
        server.quit()
        return True, f"Successfully authenticated with SMTP server {cfg['host']} as {cfg['user']}."
    except smtplib.SMTPAuthenticationError:
        return False, "SMTP authentication failed. Please verify your Gmail address and 16-character App Password."
    except Exception as e:
        return False, f"SMTP connection failed: {type(e).__name__} - {str(e)}"

def generate_verification_token() -> tuple[str, str, datetime]:
    """
    Generates a cryptographically secure raw token, its SHA-256 hash, and an expiration timestamp.
    Returns (raw_token, token_hash, expires_at).
    """
    cfg = get_smtp_config()
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(hours=cfg["expire_hours"])
    return raw_token, token_hash, expires_at

def hash_token(raw_token: str) -> str:
    """Computes SHA-256 hash of a verification token."""
    return hashlib.sha256(raw_token.encode()).hexdigest()

def send_verification_email(to_email: str, student_name: str, raw_token: str) -> dict:
    """
    Sends an email verification link to the student using Gmail SMTP (STARTTLS).
    Never logs raw tokens or passwords.
    In production, never exposes direct verification links in the response payload.
    """
    cfg = get_smtp_config()
    verification_url = f"{cfg['frontend_url']}/verify-email?token={raw_token}"
    is_valid, validation_msg = validate_smtp_config()

    if not is_valid:
        dev_link = verification_url if is_dev_mode() else None
        return {
            "sent": False,
            "method": "unconfigured",
            "message": (
                "SMTP email service is not configured on this server. "
                "In local development, use the direct link below to verify your account."
                if is_dev_mode() else
                "Registration completed, but verification email service is temporarily unconfigured. Please contact support."
            ),
            "verification_url": dev_link,
            "error_detail": validation_msg
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Verify your MetaGuard Student Account"
        msg["From"] = cfg["from_email"]
        msg["To"] = to_email

        text_content = f"""Hello {student_name},

Thank you for registering on the MetaGuard Academic Integrity Platform.
Please verify your student email address by opening the link below:

{verification_url}

This link is valid for {cfg['expire_hours']} hours and can only be used once.

Best regards,
MetaGuard Academic Team
"""

        html_content = f"""<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #1e293b; border-radius: 14px; padding: 32px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="color: #6366f1; margin: 0; font-size: 24px; letter-spacing: -0.5px;">MetaGuard</h2>
      <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Academic Integrity & Plagiarism Platform</p>
    </div>
    
    <p style="font-size: 15px; color: #f1f5f9;">Hello <strong>{student_name}</strong>,</p>
    <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6;">
      Welcome to MetaGuard! Please confirm your student email address to activate your account and access your assignment dashboard.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="{verification_url}" style="background-color: #6366f1; color: #ffffff; padding: 13px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(99,102,241,0.4);">
        Verify Email Address
      </a>
    </div>

    <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="{verification_url}" style="color: #818cf8; word-break: break-all;">{verification_url}</a>
    </p>
    
    <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b;">
      <p style="margin: 0;">This verification link will expire in {cfg['expire_hours']} hours and can only be used once.</p>
      <p style="margin: 4px 0 0 0;">If you did not register for a MetaGuard account, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
"""

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        if cfg["port"] == 465:
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=15)
        else:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from_email"], [to_email], msg.as_string())
        server.quit()

        return {
            "sent": True,
            "method": "smtp",
            "message": "Verification email sent successfully. Please check your inbox.",
            "verification_url": None
        }

    except smtplib.SMTPAuthenticationError:
        dev_link = verification_url if is_dev_mode() else None
        return {
            "sent": False,
            "method": "auth_error",
            "message": (
                "SMTP authentication failed. Please check your Gmail address and 16-character App Password."
                if is_dev_mode() else
                "Could not deliver verification email due to mail service configuration. Please contact the administrator."
            ),
            "verification_url": dev_link,
            "error_detail": "Authentication error"
        }
    except Exception as e:
        dev_link = verification_url if is_dev_mode() else None
        return {
            "sent": False,
            "method": "connection_error",
            "message": (
                f"Could not send email via SMTP ({type(e).__name__})."
                if is_dev_mode() else
                "Could not send verification email. Please try again or use the resend option."
            ),
            "verification_url": dev_link,
            "error_detail": str(e)
        }
