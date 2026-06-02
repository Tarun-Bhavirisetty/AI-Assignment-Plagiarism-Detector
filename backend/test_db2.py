from database import SessionLocal
import models

db = SessionLocal()
uploads_with_users = db.query(models.Upload, models.User).join(
    models.User, models.Upload.user_id == models.User.id
).order_by(models.Upload.upload_time.desc()).all()

print("Join count:", len(uploads_with_users))
for upload, user in uploads_with_users:
    print(upload.id, user.id)
