import sqlite3
import os

DB_PATH = "metaguard.db# JWT Authentication"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Add columns to uploads table
        columns_to_add = [
            ("extracted_text", "TEXT"),
            ("cleaned_text", "TEXT")
        ]

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
        print("Migration v2 successful.")

    except Exception as e:
        print("Migration v2 error:", e)
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
