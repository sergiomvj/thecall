from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "prisma" / "dev.db"
MIGRATIONS_DIR = ROOT / "prisma" / "migrations"


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(DB_PATH) as conn:
        for migration_path in sorted(MIGRATIONS_DIR.glob("*/migration.sql")):
            sql = migration_path.read_text(encoding="utf-8")
            try:
                conn.executescript(sql)
            except sqlite3.OperationalError as exc:
                if "duplicate column name" not in str(exc).lower():
                    raise
        conn.commit()

    print(f"SQLite initialized at {DB_PATH}")


if __name__ == "__main__":
    main()
