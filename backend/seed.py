"""Run once at container startup to create DB schema and seed the single user."""
import os
import sqlite3
from werkzeug.security import generate_password_hash

DATABASE = os.path.join(os.path.dirname(__file__), "data", "expenses.db")


def init_db():
    os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
    db = sqlite3.connect(DATABASE)
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT    NOT NULL,
            email         TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id          INTEGER NOT NULL,
            amount_paise     INTEGER NOT NULL,
            spent_on         TEXT    NOT NULL,
            category         TEXT    NOT NULL DEFAULT '',
            note             TEXT    NOT NULL DEFAULT '',
            expense_datetime TEXT    NOT NULL,
            created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_exp_user_dt
            ON expenses(user_id, expense_datetime);

        CREATE TABLE IF NOT EXISTS settings (
            user_id INTEGER NOT NULL,
            key     TEXT    NOT NULL,
            value   TEXT    NOT NULL,
            PRIMARY KEY (user_id, key),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS weekly_periods (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL,
            week_start   TEXT    NOT NULL,
            week_end     TEXT    NOT NULL,
            budget_paise INTEGER NOT NULL,
            spent_paise  INTEGER NOT NULL,
            created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    """)
    db.commit()

    name = os.environ.get("USER_NAME", "Wajahat Ahmed")
    email = os.environ.get("USER_EMAIL", "wajahatahmad056@gmail.com")
    password = os.environ["USER_PASSWORD"]

    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not existing:
        pw_hash = generate_password_hash(password)
        db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, pw_hash),
        )
        db.commit()
        print(f"[seed] Created user: {email}")
    else:
        print(f"[seed] User already exists: {email}")

    db.close()


if __name__ == "__main__":
    init_db()
