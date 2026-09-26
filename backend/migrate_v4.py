from database import engine
import models

def upgrade():
    print("Connecting to database...")
    print("Creating new tables for V4 Multi-Layer System...")
    # This will create tables that don't exist yet based on models.Base
    models.Base.metadata.create_all(bind=engine)
    print("Database upgrade to V4 successful!")

if __name__ == "__main__":
    upgrade()
