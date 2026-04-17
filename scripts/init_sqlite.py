from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "prisma" / "dev.db"
MIGRATION_PATH = ROOT / "prisma" / "migrations" / "20260417_init" / "migration.sql"


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    sql = MIGRATION_PATH.read_text(encoding="utf-8")

    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(sql)
        conn.commit()

    print(f"SQLite initialized at {DB_PATH}")


if __name__ == "__main__":
    main()
