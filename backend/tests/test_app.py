"""Tests for the Expense Tracker Flask API."""
import os
import sys
import tempfile
import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-32bytes-xxxxxxxxxxx")
os.environ.setdefault("MCP_API_KEY", "test-mcp-key")
os.environ.setdefault("USER_PASSWORD", "testpassword123")
os.environ.setdefault("USER_NAME", "Wajahat Ahmed")
os.environ.setdefault("USER_EMAIL", "wajahatahmad056@gmail.com")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import app as flask_app
import seed as seed_module


@pytest.fixture
def client(tmp_path):
    db_path = tmp_path / "test.db"
    flask_app.DATABASE = str(db_path)
    seed_module.DATABASE = str(db_path)
    seed_module.init_db()

    flask_app.app.config["TESTING"] = True
    with flask_app.app.test_client() as c:
        yield c


def login(client):
    r = client.post("/api/auth/login", json={
        "email": "wajahatahmad056@gmail.com",
        "password": "testpassword123",
    })
    assert r.status_code == 200
    return r


# ── Auth ──────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_login_success(self, client):
        r = login(client)
        data = r.get_json()
        assert data["email"] == "wajahatahmad056@gmail.com"
        assert data["name"] == "Wajahat Ahmed"

    def test_login_wrong_password(self, client):
        r = client.post("/api/auth/login", json={"email": "wajahatahmad056@gmail.com", "password": "wrong"})
        assert r.status_code == 401

    def test_login_wrong_email(self, client):
        r = client.post("/api/auth/login", json={"email": "bad@bad.com", "password": "testpassword123"})
        assert r.status_code == 401

    def test_me_authenticated(self, client):
        login(client)
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        assert r.get_json()["email"] == "wajahatahmad056@gmail.com"

    def test_me_unauthenticated(self, client):
        r = client.get("/api/auth/me")
        assert r.status_code == 401

    def test_logout(self, client):
        login(client)
        r = client.post("/api/auth/logout")
        assert r.status_code == 200
        # After logout, cookie is cleared
        r2 = client.get("/api/auth/me")
        assert r2.status_code == 401

    def test_change_password(self, client):
        login(client)
        r = client.post("/api/auth/change-password", json={
            "current_password": "testpassword123",
            "new_password": "newpassword456",
        })
        assert r.status_code == 200
        # Old password no longer works
        client.post("/api/auth/logout")
        r2 = client.post("/api/auth/login", json={"email": "wajahatahmad056@gmail.com", "password": "testpassword123"})
        assert r2.status_code == 401
        # New password works
        r3 = client.post("/api/auth/login", json={"email": "wajahatahmad056@gmail.com", "password": "newpassword456"})
        assert r3.status_code == 200


# ── Expenses ──────────────────────────────────────────────────────────────────

class TestExpenses:
    def _add(self, client, amount="1500", spent_on="Dinner", category="Food & Dining",
             note="test", expense_datetime="2026-09-20T19:30:00"):
        return client.post("/api/expenses", json={
            "amount": amount,
            "spent_on": spent_on,
            "category": category,
            "note": note,
            "expense_datetime": expense_datetime,
        })

    def test_add_expense(self, client):
        login(client)
        r = self._add(client)
        assert r.status_code == 201
        data = r.get_json()
        assert data["spent_on"] == "Dinner"
        assert data["amount_pkr"] == "1500.00"
        assert data["category"] == "Food & Dining"
        assert data["amount_paise"] == 150000

    def test_add_expense_decimal(self, client):
        login(client)
        r = self._add(client, amount="49.50", spent_on="Tea")
        assert r.status_code == 201
        data = r.get_json()
        assert data["amount_paise"] == 4950
        assert data["amount_pkr"] == "49.50"

    def test_add_expense_no_auth(self, client):
        r = self._add(client)
        assert r.status_code == 401

    def test_add_expense_missing_spent_on(self, client):
        login(client)
        r = client.post("/api/expenses", json={"amount": "100", "spent_on": "", "expense_datetime": "2026-09-20T10:00:00"})
        assert r.status_code == 400

    def test_add_expense_invalid_amount(self, client):
        login(client)
        r = client.post("/api/expenses", json={"amount": "-50", "spent_on": "Test", "expense_datetime": "2026-09-20T10:00:00"})
        assert r.status_code == 400

    def test_list_expenses(self, client):
        login(client)
        self._add(client, spent_on="Lunch", expense_datetime="2026-09-20T12:00:00")
        self._add(client, spent_on="Dinner", expense_datetime="2026-09-20T19:00:00")
        r = client.get("/api/expenses")
        assert r.status_code == 200
        data = r.get_json()
        assert len(data) == 2
        # Reverse chronological
        assert data[0]["spent_on"] == "Dinner"
        assert data[1]["spent_on"] == "Lunch"

    def test_list_expenses_filter_by_date(self, client):
        login(client)
        self._add(client, expense_datetime="2026-09-01T10:00:00")
        self._add(client, expense_datetime="2026-09-20T10:00:00")
        r = client.get("/api/expenses?from=2026-09-20&to=2026-09-20")
        assert r.status_code == 200
        assert len(r.get_json()) == 1

    def test_get_expense(self, client):
        login(client)
        created = self._add(client).get_json()
        r = client.get(f"/api/expenses/{created['id']}")
        assert r.status_code == 200
        assert r.get_json()["id"] == created["id"]

    def test_get_nonexistent_expense(self, client):
        login(client)
        r = client.get("/api/expenses/999")
        assert r.status_code == 404

    def test_update_expense(self, client):
        login(client)
        created = self._add(client).get_json()
        r = client.put(f"/api/expenses/{created['id']}", json={"amount": "2000", "spent_on": "Lunch"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["amount_pkr"] == "2000.00"
        assert data["spent_on"] == "Lunch"

    def test_delete_expense(self, client):
        login(client)
        created = self._add(client).get_json()
        r = client.delete(f"/api/expenses/{created['id']}")
        assert r.status_code == 204
        r2 = client.get(f"/api/expenses/{created['id']}")
        assert r2.status_code == 404

    def test_delete_nonexistent(self, client):
        login(client)
        r = client.delete("/api/expenses/999")
        assert r.status_code == 404


# ── Dashboard ─────────────────────────────────────────────────────────────────

class TestDashboard:
    def test_dashboard_empty(self, client):
        login(client)
        r = client.get("/api/dashboard")
        assert r.status_code == 200
        data = r.get_json()
        assert "today_total_pkr" in data
        assert "month_total_pkr" in data
        assert "recent_expenses" in data
        assert "category_totals" in data

    def test_dashboard_unauthenticated(self, client):
        assert client.get("/api/dashboard").status_code == 401

    def test_health(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.get_json()["status"] == "ok"


# ── Budget ───────────────────────────────────────────────────────────────────

class TestBudget:
    def test_get_budget_unauthenticated(self, client):
        assert client.get("/api/budget").status_code == 401

    def test_get_budget_no_config(self, client):
        login(client)
        r = client.get("/api/budget")
        assert r.status_code == 200
        data = r.get_json()
        assert data["budget_configured"] is False
        assert data["budget_paise"] == 0

    def test_set_budget(self, client):
        login(client)
        r = client.put("/api/budget", json={"weekly_budget": "5000"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["budget_configured"] is True
        assert data["budget_pkr"] == "5000.00"
        assert data["budget_paise"] == 500000

    def test_budget_tracks_expenses(self, client):
        login(client)
        client.put("/api/budget", json={"weekly_budget": "5000"})
        # Add expense in current week
        import datetime
        today = datetime.date.today().strftime("%Y-%m-%d")
        client.post("/api/expenses", json={
            "amount": "1500",
            "spent_on": "Lunch",
            "expense_datetime": f"{today}T12:00:00",
        })
        r = client.get("/api/budget")
        data = r.get_json()
        assert data["spent_paise"] == 150000
        assert data["percent_used"] == 30.0

    def test_budget_history_unauthenticated(self, client):
        r = client.get("/api/budget/history")
        assert r.status_code == 401

    def test_budget_history_authenticated(self, client):
        login(client)
        r = client.get("/api/budget/history")
        assert r.status_code == 200
        assert isinstance(r.get_json(), list)


# ── Calendar ──────────────────────────────────────────────────────────────────

class TestCalendar:
    def test_calendar_unauthenticated(self, client):
        assert client.get("/api/calendar/2026/9").status_code == 401

    def test_calendar_empty_month(self, client):
        login(client)
        r = client.get("/api/calendar/2025/1")
        assert r.status_code == 200
        assert r.get_json() == []

    def test_calendar_with_expenses(self, client):
        login(client)
        client.post("/api/expenses", json={
            "amount": "850", "spent_on": "Lunch",
            "expense_datetime": "2026-09-20T12:00:00",
        })
        client.post("/api/expenses", json={
            "amount": "1500", "spent_on": "Petrol",
            "expense_datetime": "2026-09-20T18:00:00",
        })
        client.post("/api/expenses", json={
            "amount": "200", "spent_on": "Tea",
            "expense_datetime": "2026-09-21T08:00:00",
        })
        r = client.get("/api/calendar/2026/9")
        assert r.status_code == 200
        days = r.get_json()
        assert len(days) == 2
        sep20 = next(d for d in days if d["date"] == "2026-09-20")
        assert sep20["total_paise"] == 235000  # 850+1500=2350 PKR
        assert sep20["count"] == 2


# ── Poll ──────────────────────────────────────────────────────────────────────

class TestPoll:
    def test_poll_unauthenticated(self, client):
        assert client.get("/api/poll").status_code == 401

    def test_poll_returns_fingerprint(self, client):
        login(client)
        r = client.get("/api/poll")
        assert r.status_code == 200
        data = r.get_json()
        assert "fingerprint" in data

    def test_poll_changes_after_expense(self, client):
        login(client)
        fp1 = client.get("/api/poll").get_json()["fingerprint"]
        client.post("/api/expenses", json={
            "amount": "100", "spent_on": "Test",
            "expense_datetime": "2026-09-20T10:00:00",
        })
        fp2 = client.get("/api/poll").get_json()["fingerprint"]
        assert fp1 != fp2


# ── Money representation ──────────────────────────────────────────────────────

class TestMoney:
    def test_paise_storage(self, client):
        """Money must be stored as integer paise with no floating-point loss."""
        login(client)
        r = client.post("/api/expenses", json={
            "amount": "999.99",
            "spent_on": "Test",
            "expense_datetime": "2026-09-20T10:00:00",
        })
        data = r.get_json()
        assert data["amount_paise"] == 99999
        assert data["amount_pkr"] == "999.99"

    def test_large_amount(self, client):
        login(client)
        r = client.post("/api/expenses", json={
            "amount": "99999",
            "spent_on": "Big purchase",
            "expense_datetime": "2026-09-20T10:00:00",
        })
        assert r.status_code == 201
        assert r.get_json()["amount_paise"] == 9999900
