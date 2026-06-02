from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models
from routes import router

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MetaGuard API",
    description="AI-Based Upload Monitoring & Duplicate Detection Platform",
    version="1.0.0"
)

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router)

from sqlalchemy.orm import Session
from database import SessionLocal
from routes import get_password_hash
from sqlalchemy import text

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        # Attempt to add 'role' column if it doesn't exist
        db.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'user';"))
        db.commit()
    except Exception:
        db.rollback()
        
    try:
        admin_email = "admin@metaguard.com"
        admin = db.query(models.User).filter(models.User.email == admin_email).first()
        if not admin:
            hashed_password = get_password_hash("admin123")
            new_admin = models.User(name="Admin", email=admin_email, password_hash=hashed_password, role="admin")
            db.add(new_admin)
            db.commit()
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Welcome to MetaGuard API. Go to /docs for Swagger UI."}
