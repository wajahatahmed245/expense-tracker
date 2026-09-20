import { useState, useEffect } from "react";
import { api } from "../api.js";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function nowPKT() {
  const pktMs = Date.now() + PKT_OFFSET_MS;
  const d = new Date(pktMs);
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return { date, time };
}

const DEFAULT_CATEGORIES = [
  "Food & Dining", "Transport", "Shopping", "Bills & Utilities",
  "Entertainment", "Health", "Education", "Other",
];

function fmt(pkr) {
  return parseFloat(pkr).toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export default function AddExpense({ expense, onSaved, onCancel }) {
  const isEdit = !!expense;
  const { date: todayDate, time: nowTime } = nowPKT();

  const [amount, setAmount]   = useState(isEdit ? (parseFloat(expense.amount_pkr)).toFixed(0) : "");
  const [spentOn, setSpentOn] = useState(isEdit ? expense.spent_on : "");
  const [category, setCategory] = useState(isEdit ? expense.category : "");
  const [note, setNote]       = useState(isEdit ? expense.note : "");
  const [date, setDate]       = useState(isEdit ? expense.expense_datetime.split("T")[0] : todayDate);
  const [time, setTime]       = useState(
    isEdit ? (expense.expense_datetime.split("T")[1] || nowTime).substring(0, 5) : nowTime
  );
  const [error, setError]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [budgetWarn, setBudgetWarn] = useState(null); // { level, message, newPct }

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  const doSave = async (amtNum) => {
    const expense_datetime = `${date}T${time}:00`;
    const payload = {
      amount: amtNum.toFixed(2),
      spent_on: spentOn.trim(),
      category: category.trim(),
      note: note.trim(),
      expense_datetime,
    };
    setSaving(true);
    try {
      if (isEdit) {
        await api.updateExpense(expense.id, payload);
      } else {
        await api.createExpense(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBudgetWarn(null);

    const amtNum = parseFloat(amount);
    if (!amount || isNaN(amtNum) || amtNum <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (!spentOn.trim()) {
      setError("Please enter where you spent");
      return;
    }

    // Budget warning check (skip for edits — amount change is ambiguous)
    if (!isEdit) {
      try {
        const budget = await api.getBudget();
        if (budget.budget_configured && budget.budget_paise > 0) {
          const addedPaise = Math.round(amtNum * 100);
          const newSpentPaise = budget.spent_paise + addedPaise;
          const newPct = (newSpentPaise / budget.budget_paise) * 100;
          const curPct = budget.percent_used;

          let warn = null;
          if (newPct >= 100) {
            warn = {
              level: "exceeded",
              message: `This will take you to ${newPct.toFixed(0)}% of your weekly budget (₨${fmt(budget.budget_pkr)}).`,
              newPct,
            };
          } else if (newPct >= 90 && curPct < 90) {
            warn = {
              level: "high",
              message: `You'll have used ${newPct.toFixed(0)}% of your weekly budget after this expense.`,
              newPct,
            };
          } else if (newPct >= 70 && curPct < 70) {
            warn = {
              level: "warning",
              message: `You're approaching your weekly limit. This expense brings you to ${newPct.toFixed(0)}%.`,
              newPct,
            };
          }

          if (warn) {
            setBudgetWarn({ ...warn, amtNum });
            return;
          }
        }
      } catch {
        // Budget check failed silently — proceed with save
      }
    }

    await doSave(amtNum);
  };

  const handleConfirmAnyway = async () => {
    setBudgetWarn(null);
    await doSave(budgetWarn.amtNum);
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Amount (PKR) *</label>
          <div className="input-prefix">
            <input
              className="form-input amount-input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus={!isEdit}
              inputMode="decimal"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Spent On *</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. Dinner, Petrol, Groceries"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Category</label>
          <select
            className="form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">— Select category —</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              className="form-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Time (PKT)</label>
            <input
              className="form-input"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Note (optional)</label>
          <textarea
            className="form-textarea"
            placeholder="Any extra detail…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary mt-12" type="submit" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Update Expense" : "Add Expense"}
        </button>
        <button type="button" className="btn btn-outline mt-12" onClick={onCancel}>
          Cancel
        </button>
      </form>

      {budgetWarn && (
        <div className="overlay" onClick={() => setBudgetWarn(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className={`warn-icon ${budgetWarn.level}`}>
              {budgetWarn.level === "exceeded" ? "⚠️" : "💛"}
            </div>
            <div className="sheet-title">
              {budgetWarn.level === "exceeded"
                ? "Weekly Budget Exceeded"
                : budgetWarn.level === "high"
                ? "Almost at Weekly Limit"
                : "Approaching Weekly Limit"}
            </div>
            <p className="text-muted" style={{ marginTop: 8 }}>
              {budgetWarn.message}
            </p>
            <div className="sheet-btns">
              <button className="btn btn-outline" onClick={() => setBudgetWarn(null)}>
                Cancel
              </button>
              <button
                className={`btn ${budgetWarn.level === "exceeded" ? "btn-danger" : "btn-primary"}`}
                onClick={handleConfirmAnyway}
                disabled={saving}
              >
                {saving ? "Saving…" : "Add Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
