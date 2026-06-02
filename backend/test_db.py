from database import SessionLocal
import models

db = SessionLocal()
all_uploads = db.query(models.Upload).all()
print("Total uploads:", len(all_uploads))
if len(all_uploads) > 0:
    for u in all_uploads:
        print(u.id, u.user_id, u.file_name, u.upload_time)

all_users = db.query(models.User).all()
print("Total users:", len(all_users))
for u in all_users:
    print(u.id, u.email)
