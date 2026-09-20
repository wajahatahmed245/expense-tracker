import { useState, useEffect } from "react";
import { api } from "../api.js";
import ExpenseItem from "./ExpenseItem.jsx";

function currentMonthPKT() {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function todayPKT() {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(pkt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function ExpenseHistory({ onEdit }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState("month");
  const [filterCategory, setFilterCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [totalPkr, setTotalPkr] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterPeriod === "today") {
        const t = todayPKT();
        params.from = t;
        params.to = t;
      } else if (filterPeriod === "month") {
        const m = currentMonthPKT();
        params.from = `${m}-01`;
        params.to = `${m}-31`;
      } else if (filterPeriod === "week") {
        const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
        const day = pkt.getUTCDay();
        const diff = (day + 6) % 7;
        const mon = new Date(pkt.getTime() - diff * 86400000);
        params.from = mon.toISOString().split("T")[0];
        params.to = todayPKT();
      }
      if (filterCategory) params.category = filterCategory;
      params.limit = 200;

      const data = await api.listExpenses(params);
      setExpenses(data);
      const total = data.reduce((s, e) => s + parseFloat(e.amount_pkr), 0);
      setTotalPkr(total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterPeriod, filterCategory]);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  return (
    <div>
      <div className="filter-row">
        <select className="filter-select" value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="all">All Time</option>
        </select>
        <select className="filter-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {!loading && expenses.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span className="text-muted">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            ₨{totalPkr.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
          </span>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <p>No expenses found for this period.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            {expenses.map((exp) => (
              <ExpenseItem key={exp.id} expense={exp} onEdit={onEdit} onDeleted={load} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
