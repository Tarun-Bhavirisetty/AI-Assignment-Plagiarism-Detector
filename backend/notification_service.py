"""
Notification Service for MetaGuard
Provides in-app notification persistence and optional email notifications
for assignment publishing, submission receipts, evaluations, and deadline reminders.
"""

from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
import models
from email_service import send_email, get_smtp_config

def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    type: str = "info",
    link: Optional[str] = None,
    send_email_notification: bool = True
) -> models.Notification:
    """Create an in-app notification record and attempt email delivery."""
    notif = models.Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        link=link,
        is_read=False,
        created_at=datetime.now(timezone.utc)
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    if send_email_notification:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user and user.email:
            try:
                html_body = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 15px 20px; border-radius: 8px; color: white;">
                        <h2 style="margin: 0; font-size: 18px;">MetaGuard Notification</h2>
                    </div>
                    <div style="padding: 20px 0;">
                        <h3 style="color: #1e293b; margin-top: 0;">{title}</h3>
                        <p style="color: #475569; font-size: 14px; line-height: 1.6;">{message}</p>
                    </div>
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #94a3b8;">
                        This is an automated notification from MetaGuard Academic Integrity Platform.
                    </div>
                </div>
                """
                send_email(user.email, f"[MetaGuard] {title}", html_body)
            except Exception as e:
                # Do not block application flow if SMTP fails
                pass

    return notif

def notify_section_students(
    db: Session,
    section_names: List[str],
    title: str,
    message: str,
    type: str = "assignment_published",
    link: Optional[str] = None
) -> int:
    """Notify all students enrolled in the given sections."""
    if not section_names:
        return 0

    students = db.query(models.User).filter(
        models.User.role == "student",
        models.User.section_name.in_(section_names)
    ).all()

    notified_count = 0
    for student in students:
        create_notification(
            db=db,
            user_id=student.id,
            title=title,
            message=message,
            type=type,
            link=link,
            send_email_notification=True
        )
        notified_count += 1

    return notified_count
