import os
import glob
import sqlite3

def run_cleanup(db_path: str = r"d:\pp\backend\ibvap.db", storage_dir: str = r"d:\pp\backend\storage"):
    print("==================================================")
    print("EXECUTING DATABASE CLEANUP OF DUMMY SURVEILLANCE DATA")
    print("==================================================")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Tables to clean (all verified dummy/test surveillance records)
    tables_to_purge = [
        "incident_notes",
        "incidents",
        "detections",
        "events",
        "evidence",
        "audit_records",
        "zones",
        "cameras"
    ]

    for table in tables_to_purge:
        cur.execute(f"DELETE FROM {table};")
        print(f"Purged all records from table: {table}")

    conn.commit()

    print("\nVACUUMING DATABASE TO RECLAIM DISK SPACE...")
    cur.execute("VACUUM;")
    conn.commit()
    conn.close()

    # Clean residual files in storage/evidence and storage/uploads
    evidence_dir = os.path.join(storage_dir, "evidence")
    uploads_dir = os.path.join(storage_dir, "uploads")

    ev_files = glob.glob(os.path.join(evidence_dir, "*"))
    for f in ev_files:
        if os.path.isfile(f):
            try:
                os.remove(f)
            except Exception as e:
                print(f"Warning: could not remove evidence file {f}: {e}")
    print(f"Removed {len(ev_files)} residual evidence files from {evidence_dir}")

    up_files = glob.glob(os.path.join(uploads_dir, "*"))
    for f in up_files:
        if os.path.isfile(f):
            try:
                os.remove(f)
            except Exception as e:
                print(f"Warning: could not remove upload file {f}: {e}")
    print(f"Removed {len(up_files)} residual upload files from {uploads_dir}")

    print("\nCleanup completed successfully.")

if __name__ == "__main__":
    run_cleanup()
