import { useState, useEffect } from "react";
import { api } from "../api.js";
import ExpenseItem from "./ExpenseItem.jsx";

export default function Dashboard({ onEdit }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.dashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading">Loading…</div>;
  if (!data) return <div className="empty-state"><p>Could not load dashboard.</p></div>;

  const fmt = (pkr) => {
    const n = parseFloat(pkr);
    return n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
  };

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Today</div>
          <div className="stat-value today">
            <span className="pkr-prefix">₨</span>{fmt(data.today_total_pkr)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">This Month</div>
          <div className="stat-value month">
            <span className="pkr-prefix">₨</span>{fmt(data.month_total_pkr)}
          </div>
        </div>
      </div>

      {data.category_totals.length > 0 && (
        <div className="card mb-20">
          <div className="card-body">
            <div className="section-title">This Month by Category</div>
            {data.category_totals.map((cat) => (
              <div key={cat.category} className="cat-item">
                <div>
                  <div className="cat-name">{cat.category}</div>
                  <div className="cat-count">{cat.count} expense{cat.count !== 1 ? "s" : ""}</div>
                </div>
                <div className="cat-amount">₨{fmt(cat.total_pkr)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-title">Recent Expenses</div>
      {data.recent_expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <p>No expenses yet. Tap + Add to record your first one.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            {data.recent_expenses.map((exp) => (
              <ExpenseItem key={exp.id} expense={exp} onEdit={onEdit} onDeleted={load} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
