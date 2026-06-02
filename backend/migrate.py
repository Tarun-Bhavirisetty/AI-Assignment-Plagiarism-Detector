import sqlite3
import os

DB_PATH = "metaguard.db# JWT Authentication"

def migrate():
    if not os.path.exists(DB_PATH):
        print("Database not found. Make sure to run this script in the backend folder.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Create sections table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR UNIQUE
            )
        ''')
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_sections_id ON sections (id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_sections_name ON sections (name)")
        
        # Add columns to uploads table
        columns_to_add = [
            ("section_name", "VARCHAR"),
            ("assignment_title", "VARCHAR"),
            ("duplicate_type", "VARCHAR"),
            ("matched_student", "VARCHAR")
        ]

        # Get existing columns
        cursor.execute("PRAGMA table_info(uploads)")
        existing_columns = [col[1] for col in cursor.fetchall()]

        for col_name, col_type in columns_to_add:
            if col_name not in existing_columns:
                try:
                    cursor.execute(f"ALTER TABLE uploads ADD COLUMN {col_name} {col_type}")
                    print(f"Added column {col_name}")
                except Exception as e:
                    print(f"Error adding {col_name}: {e}")

        conn.commit()
        print("Migration successful.")

    except Exception as e:
        print("Migration error:", e)
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
