import sqlite3
import os

for db_filename in ["ibvap.db", "ibavp.db"]:
    db_path = os.path.join(os.path.dirname(__file__), "..", "..", db_filename)
    db_path = os.path.abspath(db_path)

    if os.path.exists(db_path):
        print(f"Migrating database file: {db_path}")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(zones)")
        cols = [row[1] for row in cursor.fetchall()]
        print("Existing columns in zones table:", cols)

        new_cols = [
            ("status", "TEXT DEFAULT 'CONFIRMED'"),
            ("zone_kind", "TEXT DEFAULT 'POLYGON'"),
            ("crossing_direction", "TEXT DEFAULT 'both'"),
            ("monitored_objects", "JSON"),
            ("rules_config", "JSON"),
            ("confirmed_by", "TEXT"),
            ("confirmed_at", "DATETIME"),
            ("rejection_reason", "TEXT")
        ]

        for col_name, col_type in new_cols:
            if col_name not in cols:
                try:
                    cursor.execute(f"ALTER TABLE zones ADD COLUMN {col_name} {col_type}")
                    print(f"Successfully added column '{col_name}' to zones table.")
                except Exception as e:
                    print(f"Notice adding column '{col_name}': {e}")

        conn.commit()
        conn.close()
        print(f"DB Migration completed for {db_filename}.")
