from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Optional

import jwt
from flask import Flask, g, jsonify, make_response, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=os.environ.get("CORS_ORIGINS", "http://localhost:8080").split(","))

DATABASE = os.path.join(os.path.dirname(__file__), "data", "expenses.db")
SECRET_KEY = os.environ["SECRET_KEY"]
API_KEY = os.environ.get("MCP_API_KEY", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24 * 7
COOKIE_NAME = "expense_token"

PKT = timezone(timedelta(hours=5))


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


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
    db.close()


# ── JWT helpers ───────────────────────────────────────────────────────────────

def make_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def _get_token_from_request() -> Optional[str]:
    # 1. httpOnly cookie (browser)
    tok = request.cookies.get(COOKIE_NAME)
    if tok:
        return tok
    # 2. Authorization: Bearer <token> (MCP / API clients)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    # 3. X-API-Key (MCP server internal calls)
    api_key = request.headers.get("X-API-Key", "")
    if api_key and api_key == API_KEY and API_KEY:
        return None  # signals api-key-authenticated, handled below
    return None


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Allow MCP server to authenticate with API key
        api_key = request.headers.get("X-API-Key", "")
        if api_key and api_key == API_KEY and API_KEY:
            db = get_db()
            row = db.execute("SELECT id FROM users LIMIT 1").fetchone()
            if row:
                g.user_id = row["id"]
                return f(*args, **kwargs)
            return jsonify({"error": "No user found"}), 500

        token = _get_token_from_request()
        if not token:
            return jsonify({"error": "Unauthorized"}), 401
        payload = decode_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401
        g.user_id = int(payload["sub"])
        return f(*args, **kwargs)

    return decorated


# ── Money helpers ─────────────────────────────────────────────────────────────

def pkr_to_paise(pkr_str: str) -> int:
    """Convert PKR string (e.g. '1500' or '49.50') to integer paise."""
    try:
        val = round(float(pkr_str) * 100)
        if val <= 0:
            raise ValueError
        return int(val)
    except (ValueError, TypeError):
        raise ValueError("Invalid amount")


def paise_to_pkr(paise: int) -> str:
    """Convert paise integer to formatted PKR string."""
    return f"{paise / 100:.2f}"


def expense_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "amount_pkr": paise_to_pkr(row["amount_paise"]),
        "amount_paise": row["amount_paise"],
        "spent_on": row["spent_on"],
        "category": row["category"],
        "note": row["note"],
        "expense_datetime": row["expense_datetime"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


# ── Settings / Budget helpers ─────────────────────────────────────────────────

def get_setting(db, user_id: int, key: str, default: Optional[str] = None) -> Optional[str]:
    row = db.execute(
        "SELECT value FROM settings WHERE user_id=? AND key=?", (user_id, key)
    ).fetchone()
    return row["value"] if row else default


def set_setting(db, user_id: int, key: str, value: str) -> None:
    db.execute(
        "INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?,?,?)",
        (user_id, key, str(value)),
    )


def maybe_rollover_week(db, user_id: int) -> None:
    """Archive any expired weekly periods and advance week_start to current week."""
    now_pkt = datetime.now(PKT)
    today = now_pkt.date()

    budget_paise = int(get_setting(db, user_id, "weekly_budget_paise", "0"))
    week_start_str = get_setting(db, user_id, "week_start_date", None)

    if not week_start_str:
        set_setting(db, user_id, "week_start_date", today.strftime("%Y-%m-%d"))
        db.commit()
        return

    week_start = datetime.strptime(week_start_str, "%Y-%m-%d").date()

    changed = False
    while (week_start + timedelta(days=7)) <= today:
        week_end = week_start + timedelta(days=6)

        existing = db.execute(
            "SELECT id FROM weekly_periods WHERE user_id=? AND week_start=?",
            (user_id, week_start.strftime("%Y-%m-%d")),
        ).fetchone()

        if not existing:
            spent = db.execute(
                """SELECT COALESCE(SUM(amount_paise),0) AS total FROM expenses
                   WHERE user_id=? AND expense_datetime>=? AND expense_datetime<=?""",
                (user_id, f"{week_start}T00:00:00", f"{week_end}T23:59:59"),
            ).fetchone()["total"]
            db.execute(
                """INSERT INTO weekly_periods
                   (user_id, week_start, week_end, budget_paise, spent_paise)
                   VALUES (?,?,?,?,?)""",
                (user_id, week_start.strftime("%Y-%m-%d"),
                 week_end.strftime("%Y-%m-%d"), budget_paise, spent),
            )

        week_start = week_start + timedelta(days=7)
        changed = True

    if changed:
        set_setting(db, user_id, "week_start_date", week_start.strftime("%Y-%m-%d"))
        db.commit()


def get_week_status(db, user_id: int) -> dict:
    maybe_rollover_week(db, user_id)

    now_pkt = datetime.now(PKT)
    today = now_pkt.date()

    budget_paise = int(get_setting(db, user_id, "weekly_budget_paise", "0"))
    week_start_str = get_setting(db, user_id, "week_start_date", today.strftime("%Y-%m-%d"))
    week_start = datetime.strptime(week_start_str, "%Y-%m-%d").date()
    week_end = week_start + timedelta(days=6)

    days_elapsed = (today - week_start).days
    days_remaining = max(0, 7 - days_elapsed)

    spent_paise = db.execute(
        """SELECT COALESCE(SUM(amount_paise),0) AS total FROM expenses
           WHERE user_id=? AND expense_datetime>=? AND expense_datetime<=?""",
        (user_id, f"{week_start}T00:00:00", f"{week_end}T23:59:59"),
    ).fetchone()["total"]

    remaining_paise = max(0, budget_paise - spent_paise)
    pct = round(spent_paise / budget_paise * 100, 1) if budget_paise > 0 else 0.0

    return {
        "budget_paise": budget_paise,
        "budget_pkr": paise_to_pkr(budget_paise),
        "spent_paise": spent_paise,
        "spent_pkr": paise_to_pkr(spent_paise),
        "remaining_paise": remaining_paise,
        "remaining_pkr": paise_to_pkr(remaining_paise),
        "percent_used": pct,
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "is_exceeded": budget_paise > 0 and spent_paise > budget_paise,
        "week_start": week_start.strftime("%Y-%m-%d"),
        "week_end": week_end.strftime("%Y-%m-%d"),
        "budget_configured": budget_paise > 0,
    }


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = make_token(row["id"])
    resp = make_response(jsonify({"name": row["name"], "email": row["email"]}))
    resp.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="Strict",
        secure=False,  # set True when HTTPS is available
        max_age=60 * 60 * JWT_EXPIRES_HOURS,
        path="/",
    )
    return resp


@app.post("/api/auth/logout")
def logout():
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


@app.get("/api/auth/me")
@require_auth
def me():
    db = get_db()
    row = db.execute("SELECT name, email FROM users WHERE id = ?", (g.user_id,)).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"name": row["name"], "email": row["email"]})


@app.post("/api/auth/change-password")
@require_auth
def change_password():
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new_pw = data.get("new_password") or ""

    if len(new_pw) < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 400

    db = get_db()
    row = db.execute("SELECT password_hash FROM users WHERE id = ?", (g.user_id,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], current):
        return jsonify({"error": "Current password is incorrect"}), 401

    new_hash = generate_password_hash(new_pw)
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, g.user_id))
    db.commit()
    return jsonify({"ok": True})


# ── Expense routes ────────────────────────────────────────────────────────────

@app.post("/api/expenses")
@require_auth
def create_expense():
    data = request.get_json(silent=True) or {}
    try:
        amount_paise = pkr_to_paise(data.get("amount", ""))
    except ValueError:
        return jsonify({"error": "Amount must be a positive number"}), 400

    spent_on = (data.get("spent_on") or "").strip()
    if not spent_on:
        return jsonify({"error": "Spent on is required"}), 400

    category = (data.get("category") or "").strip()[:100]
    note = (data.get("note") or "").strip()[:500]
    expense_datetime = (data.get("expense_datetime") or "").strip()
    if not expense_datetime:
        return jsonify({"error": "expense_datetime is required"}), 400

    db = get_db()
    cur = db.execute(
        """INSERT INTO expenses (user_id, amount_paise, spent_on, category, note, expense_datetime)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (g.user_id, amount_paise, spent_on[:200], category, note, expense_datetime),
    )
    db.commit()
    row = db.execute("SELECT * FROM expenses WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(expense_row_to_dict(row)), 201


@app.get("/api/expenses")
@require_auth
def list_expenses():
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    category = request.args.get("category")
    limit = min(int(request.args.get("limit", 100)), 500)
    offset = int(request.args.get("offset", 0))

    query = "SELECT * FROM expenses WHERE user_id = ?"
    params: list = [g.user_id]

    if date_from:
        query += " AND expense_datetime >= ?"
        params.append(date_from)
    if date_to:
        query += " AND expense_datetime <= ?"
        params.append(date_to + "T23:59:59")
    if category:
        query += " AND category = ?"
        params.append(category)

    query += " ORDER BY expense_datetime DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    db = get_db()
    rows = db.execute(query, params).fetchall()
    return jsonify([expense_row_to_dict(r) for r in rows])


@app.get("/api/expenses/<int:expense_id>")
@require_auth
def get_expense(expense_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM expenses WHERE id = ? AND user_id = ?", (expense_id, g.user_id)
    ).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(expense_row_to_dict(row))


@app.put("/api/expenses/<int:expense_id>")
@require_auth
def update_expense(expense_id):
    db = get_db()
    existing = db.execute(
        "SELECT * FROM expenses WHERE id = ? AND user_id = ?", (expense_id, g.user_id)
    ).fetchone()
    if not existing:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(silent=True) or {}

    try:
        amount_paise = pkr_to_paise(data.get("amount", "")) if "amount" in data else existing["amount_paise"]
    except ValueError:
        return jsonify({"error": "Amount must be a positive number"}), 400

    spent_on = (data.get("spent_on") or existing["spent_on"]).strip()[:200]
    category = (data.get("category") if "category" in data else existing["category"] or "").strip()[:100]
    note = (data.get("note") if "note" in data else existing["note"] or "").strip()[:500]
    expense_datetime = (data.get("expense_datetime") or existing["expense_datetime"]).strip()

    now = datetime.now(PKT).isoformat(timespec="seconds")
    db.execute(
        """UPDATE expenses SET amount_paise=?, spent_on=?, category=?, note=?,
           expense_datetime=?, updated_at=? WHERE id=?""",
        (amount_paise, spent_on, category, note, expense_datetime, now, expense_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    return jsonify(expense_row_to_dict(row))


@app.delete("/api/expenses/<int:expense_id>")
@require_auth
def delete_expense(expense_id):
    db = get_db()
    existing = db.execute(
        "SELECT id FROM expenses WHERE id = ? AND user_id = ?", (expense_id, g.user_id)
    ).fetchone()
    if not existing:
        return jsonify({"error": "Not found"}), 404
    db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    db.commit()
    return "", 204


# ── Dashboard route ────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
@require_auth
def dashboard():
    db = get_db()
    now_pkt = datetime.now(PKT)

    today_str = now_pkt.strftime("%Y-%m-%d")
    month_str = now_pkt.strftime("%Y-%m")

    today_total = db.execute(
        """SELECT COALESCE(SUM(amount_paise), 0) AS total FROM expenses
           WHERE user_id = ? AND expense_datetime >= ? AND expense_datetime < ?""",
        (g.user_id, f"{today_str}T00:00:00", f"{today_str}T23:59:59"),
    ).fetchone()["total"]

    month_total = db.execute(
        """SELECT COALESCE(SUM(amount_paise), 0) AS total FROM expenses
           WHERE user_id = ? AND expense_datetime LIKE ?""",
        (g.user_id, f"{month_str}%"),
    ).fetchone()["total"]

    recent = db.execute(
        "SELECT * FROM expenses WHERE user_id = ? ORDER BY expense_datetime DESC LIMIT 10",
        (g.user_id,),
    ).fetchall()

    categories = db.execute(
        """SELECT category, COALESCE(SUM(amount_paise), 0) AS total, COUNT(*) AS count
           FROM expenses WHERE user_id = ? AND category != '' AND expense_datetime LIKE ?
           GROUP BY category ORDER BY total DESC""",
        (g.user_id, f"{month_str}%"),
    ).fetchall()

    return jsonify({
        "today_total_paise": today_total,
        "today_total_pkr": paise_to_pkr(today_total),
        "month_total_paise": month_total,
        "month_total_pkr": paise_to_pkr(month_total),
        "recent_expenses": [expense_row_to_dict(r) for r in recent],
        "category_totals": [
            {"category": r["category"], "total_pkr": paise_to_pkr(r["total"]), "count": r["count"]}
            for r in categories
        ],
    })


@app.get("/api/categories")
@require_auth
def get_categories():
    db = get_db()
    rows = db.execute(
        """SELECT DISTINCT category FROM expenses
           WHERE user_id = ? AND category != ''
           ORDER BY category""",
        (g.user_id,),
    ).fetchall()
    defaults = ["Food & Dining", "Transport", "Shopping", "Bills & Utilities",
                "Entertainment", "Health", "Education", "Other"]
    used = [r["category"] for r in rows]
    all_cats = list(dict.fromkeys(used + [c for c in defaults if c not in used]))
    return jsonify(all_cats)


# ── Budget routes ─────────────────────────────────────────────────────────────

@app.get("/api/budget")
@require_auth
def get_budget():
    db = get_db()
    return jsonify(get_week_status(db, g.user_id))


@app.put("/api/budget")
@require_auth
def update_budget():
    data = request.get_json(silent=True) or {}
    raw = str(data.get("weekly_budget", "0"))
    try:
        if float(raw) == 0:
            paise = 0
        else:
            paise = pkr_to_paise(raw)
    except ValueError:
        return jsonify({"error": "Invalid budget amount"}), 400

    week_start_date = (data.get("week_start_date") or "").strip()
    if week_start_date:
        try:
            datetime.strptime(week_start_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Invalid week_start_date, use YYYY-MM-DD"}), 400

    db = get_db()
    set_setting(db, g.user_id, "weekly_budget_paise", paise)
    if week_start_date:
        set_setting(db, g.user_id, "week_start_date", week_start_date)
    elif not get_setting(db, g.user_id, "week_start_date"):
        today = datetime.now(PKT).strftime("%Y-%m-%d")
        set_setting(db, g.user_id, "week_start_date", today)
    db.commit()
    return jsonify(get_week_status(db, g.user_id))


@app.get("/api/budget/history")
@require_auth
def budget_history():
    db = get_db()
    rows = db.execute(
        """SELECT * FROM weekly_periods WHERE user_id=?
           ORDER BY week_start DESC LIMIT 12""",
        (g.user_id,),
    ).fetchall()
    return jsonify([
        {
            "week_start": r["week_start"],
            "week_end": r["week_end"],
            "budget_pkr": paise_to_pkr(r["budget_paise"]),
            "spent_pkr": paise_to_pkr(r["spent_paise"]),
            "percent_used": (
                round(r["spent_paise"] / r["budget_paise"] * 100, 1)
                if r["budget_paise"] > 0 else 0.0
            ),
        }
        for r in rows
    ])


@app.get("/api/calendar/<int:year>/<int:month>")
@require_auth
def calendar_month(year, month):
    if not (1 <= month <= 12) or not (2000 <= year <= 2100):
        return jsonify({"error": "Invalid date"}), 400
    db = get_db()
    prefix = f"{year:04d}-{month:02d}"
    rows = db.execute(
        """SELECT substr(expense_datetime,1,10) AS day,
                  COALESCE(SUM(amount_paise),0) AS total_paise,
                  COUNT(*) AS cnt
           FROM expenses
           WHERE user_id=? AND expense_datetime LIKE ?
           GROUP BY day ORDER BY day""",
        (g.user_id, f"{prefix}%"),
    ).fetchall()
    return jsonify([
        {
            "date": r["day"],
            "total_paise": r["total_paise"],
            "total_pkr": paise_to_pkr(r["total_paise"]),
            "count": r["cnt"],
        }
        for r in rows
    ])


@app.get("/api/poll")
@require_auth
def poll():
    db = get_db()
    row = db.execute(
        """SELECT COALESCE(MAX(updated_at),'') AS u,
                  COALESCE(MAX(created_at),'') AS c,
                  COUNT(*) AS n
           FROM expenses WHERE user_id=?""",
        (g.user_id,),
    ).fetchone()
    fingerprint = f"{row['n']}:{max(row['u'], row['c'])}"
    return jsonify({"fingerprint": fingerprint})


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


# ── Startup ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    app.run(debug=False)
