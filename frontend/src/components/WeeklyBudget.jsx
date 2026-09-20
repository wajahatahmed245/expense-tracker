import { useState, useEffect } from "react";
import { api } from "../api.js";

function budgetLevel(pct) {
  if (pct >= 100) return { cls: "budget-exceeded", label: "Limit Reached" };
  if (pct >= 90)  return { cls: "budget-high",     label: "Almost Full" };
  if (pct >= 70)  return { cls: "budget-warning",  label: "Watch Out" };
  return              { cls: "budget-normal",   label: "On Track" };
}

function fmt(pkr) {
  return parseFloat(pkr).toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export default function WeeklyBudget({ refreshTick, onBudgetLoaded }) {
  const [budget, setBudget] = useState(null);

  const load = () => {
    api.getBudget()
      .then((b) => {
        setBudget(b);
        if (onBudgetLoaded) onBudgetLoaded(b);
      })
      .catch(console.error);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (refreshTick > 0) load(); }, [refreshTick]);

  if (!budget || !budget.budget_configured) return null;

  const pct = budget.percent_used;
  const { cls, label } = budgetLevel(pct);
  const barPct = Math.min(pct, 100);

  return (
    <div className={`budget-card ${cls}`}>
      <div className="budget-card-top">
        <span className="budget-card-title">Weekly Budget</span>
        <span className={`budget-badge ${cls}`}>{label}</span>
      </div>

      <div className="budget-amounts">
        <div className="budget-amount-block">
          <div className="budget-amount-label">Spent</div>
          <div className="budget-amount-value">₨{fmt(budget.spent_pkr)}</div>
        </div>
        <div className="budget-of">of ₨{fmt(budget.budget_pkr)}</div>
        <div className="budget-amount-block" style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="budget-amount-label">Remaining</div>
          <div className={`budget-amount-value ${pct >= 100 ? "text-red" : ""}`}>
            ₨{fmt(budget.remaining_pkr)}
          </div>
        </div>
      </div>

      <div className="budget-progress-wrap">
        <div className="budget-progress-track">
          <div className={`budget-progress-fill ${cls}`} style={{ width: `${barPct}%` }} />
        </div>
        <div className="budget-progress-meta">
          <span>{pct.toFixed(0)}% used</span>
          <span>{budget.days_remaining} day{budget.days_remaining !== 1 ? "s" : ""} left</span>
        </div>
      </div>
    </div>
  );
}
