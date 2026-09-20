"""
Expense Tracker MCP Server
Calls the Flask API internally using the MCP_API_KEY.
Transport: Streamable HTTP on port 8002.
"""
import os
import httpx
from mcp.server.fastmcp import FastMCP

API_BASE = os.environ.get("API_BASE_URL", "http://backend:5000/api")
API_KEY = os.environ["MCP_API_KEY"]

mcp = FastMCP("Expense Tracker", stateless_http=True)

HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}


def _client():
    return httpx.Client(base_url=API_BASE, headers=HEADERS, timeout=15)


# ── Tools ─────────────────────────────────────────────────────────────────────

@mcp.tool()
def add_expense(amount: float, spent_on: str, category: str = "", note: str = "", expense_datetime: str = "") -> str:
    """
    Record a new expense.
    amount: PKR amount (e.g. 850.0)
    spent_on: what/where you spent (e.g. 'Lunch', 'Petrol')
    category: optional (e.g. 'Food & Dining', 'Transport')
    note: optional short note
    expense_datetime: ISO datetime in PKT (e.g. '2026-09-14T13:30:00'). Defaults to now.
    """
    from datetime import datetime, timezone, timedelta
    if not expense_datetime:
        pkt = datetime.now(timezone(timedelta(hours=5)))
        expense_datetime = pkt.strftime("%Y-%m-%dT%H:%M:%S")

    payload = {
        "amount": str(round(amount, 2)),
        "spent_on": spent_on,
        "category": category,
        "note": note,
        "expense_datetime": expense_datetime,
    }
    with _client() as c:
        r = c.post("/expenses", json=payload)
        r.raise_for_status()
        e = r.json()
    return f"Added: {e['spent_on']} — ₨{float(e['amount_pkr']):,.0f} [{e['category'] or 'No category'}] at {e['expense_datetime']}"


@mcp.tool()
def list_expenses(date_from: str = "", date_to: str = "", category: str = "", limit: int = 20) -> str:
    """
    List expenses with optional filters.
    date_from / date_to: YYYY-MM-DD format
    category: filter by category name
    limit: max results (default 20)
    """
    params = {"limit": limit}
    if date_from: params["from"] = date_from
    if date_to: params["to"] = date_to
    if category: params["category"] = category

    with _client() as c:
        r = c.get("/expenses", params=params)
        r.raise_for_status()
        expenses = r.json()

    if not expenses:
        return "No expenses found."

    lines = []
    for e in expenses:
        dt = e["expense_datetime"].replace("T", " ")[:16]
        cat = f" [{e['category']}]" if e["category"] else ""
        note = f" — {e['note']}" if e["note"] else ""
        lines.append(f"#{e['id']} {dt} | ₨{float(e['amount_pkr']):,.0f} | {e['spent_on']}{cat}{note}")

    total = sum(float(e["amount_pkr"]) for e in expenses)
    lines.append(f"\nTotal: ₨{total:,.0f} ({len(expenses)} expenses)")
    return "\n".join(lines)


@mcp.tool()
def get_today_total() -> str:
    """Get the total amount spent today (PKT)."""
    with _client() as c:
        r = c.get("/dashboard")
        r.raise_for_status()
        d = r.json()
    return f"Today's total: ₨{float(d['today_total_pkr']):,.0f}"


@mcp.tool()
def get_month_total() -> str:
    """Get the total amount spent this month."""
    with _client() as c:
        r = c.get("/dashboard")
        r.raise_for_status()
        d = r.json()
    return f"This month's total: ₨{float(d['month_total_pkr']):,.0f}"


@mcp.tool()
def expense_summary() -> str:
    """Get a full summary: today, this month, category breakdown, and last 5 expenses."""
    with _client() as c:
        r = c.get("/dashboard")
        r.raise_for_status()
        d = r.json()

    lines = [
        f"TODAY: ₨{float(d['today_total_pkr']):,.0f}",
        f"THIS MONTH: ₨{float(d['month_total_pkr']):,.0f}",
    ]

    if d["category_totals"]:
        lines.append("\nThis month by category:")
        for ct in d["category_totals"]:
            lines.append(f"  {ct['category']}: ₨{float(ct['total_pkr']):,.0f} ({ct['count']} expenses)")

    if d["recent_expenses"]:
        lines.append("\nRecent expenses:")
        for e in d["recent_expenses"][:5]:
            dt = e["expense_datetime"].replace("T", " ")[:16]
            lines.append(f"  {dt} | ₨{float(e['amount_pkr']):,.0f} | {e['spent_on']}")

    return "\n".join(lines)


@mcp.tool()
def get_expenses_by_date(date: str) -> str:
    """
    Get all expenses for a specific date.
    date: YYYY-MM-DD format
    """
    return list_expenses(date_from=date, date_to=date, limit=100)


@mcp.tool()
def get_expenses_by_category(category: str, month: str = "") -> str:
    """
    Get expenses for a specific category.
    category: e.g. 'Food & Dining', 'Transport'
    month: optional YYYY-MM filter (e.g. '2026-09')
    """
    params: dict = {"category": category, "limit": 100}
    if month:
        params["date_from"] = f"{month}-01"
        params["date_to"] = f"{month}-31"
    return list_expenses(**{k: v for k, v in params.items() if k in ("date_from", "date_to", "category", "limit")})


@mcp.tool()
def update_expense(expense_id: int, amount: float = 0, spent_on: str = "", category: str = "", note: str = "") -> str:
    """
    Update an existing expense by ID. Only provide fields you want to change.
    """
    payload = {}
    if amount > 0: payload["amount"] = str(round(amount, 2))
    if spent_on: payload["spent_on"] = spent_on
    if category is not None: payload["category"] = category
    if note is not None: payload["note"] = note

    if not payload:
        return "Nothing to update — provide at least one field."

    with _client() as c:
        r = c.put(f"/expenses/{expense_id}", json=payload)
        if r.status_code == 404:
            return f"Expense #{expense_id} not found."
        r.raise_for_status()
        e = r.json()
    return f"Updated #{expense_id}: {e['spent_on']} — ₨{float(e['amount_pkr']):,.0f}"


@mcp.tool()
def delete_expense(expense_id: int) -> str:
    """
    Delete an expense by ID.
    """
    with _client() as c:
        r = c.delete(f"/expenses/{expense_id}")
        if r.status_code == 404:
            return f"Expense #{expense_id} not found."
        r.raise_for_status()
    return f"Expense #{expense_id} deleted."


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8002))
    # Build the Starlette ASGI app from FastMCP and run it via uvicorn
    app = mcp.streamable_http_app()
    uvicorn.run(app, host="0.0.0.0", port=port)
