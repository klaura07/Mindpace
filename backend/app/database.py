"""
Thin SQLite connection helper.

We're using Python's built-in sqlite3 module directly instead of an ORM
like SQLAlchemy. For a project this size, raw SQL keeps the connection
between your schema.sql and your Python code obvious — you already
wrote the schema by hand, there's no reason to hide it behind another
abstraction layer this early.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "mindpace.db"
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def get_connection() -> sqlite3.Connection:
    """
    Opens a fresh connection for a single request.

    row_factory = sqlite3.Row lets you read columns by name
    (row["email"]) instead of by position (row[1]) — much less
    error-prone as the schema grows past a handful of columns.

    SQLite has foreign key enforcement OFF by default, per connection
    (a historical quirk, not a schema setting) — so we turn it on here
    every time, or ON DELETE CASCADE would silently do nothing.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """
    Creates mindpace.db and all tables if they don't already exist.
    Safe to call on every server startup — schema.sql uses
    CREATE TABLE IF NOT EXISTS, so this never wipes existing data.
    """
    conn = get_connection()
    with open(SCHEMA_PATH) as f:
        conn.executescript(f.read())
    conn.close()
