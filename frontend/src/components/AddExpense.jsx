import { useState, useEffect } from "react";
import { api } from "../api.js";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function nowPKT() {
  const utcMs = Date.now();
  const pktMs = utcMs + PKT_OFFSET_MS;
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

export default function AddExpense({ expense, onSaved, onCancel }) {
  const isEdit = !!expense;
  const { date: todayDate, time: nowTime } = nowPKT();

  const [amount, setAmount] = useState(isEdit ? (parseFloat(expense.amount_pkr)).toFixed(0) : "");
  const [spentOn, setSpentOn] = useState(isEdit ? expense.spent_on : "");
  const [category, setCategory] = useState(isEdit ? expense.category : "");
  const [note, setNote] = useState(isEdit ? expense.note : "");
  const [date, setDate] = useState(isEdit ? expense.expense_datetime.split("T")[0] : todayDate);
  const [time, setTime] = useState(
    isEdit ? (expense.expense_datetime.split("T")[1] || nowTime).substring(0, 5) : nowTime
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const amtNum = parseFloat(amount);
    if (!amount || isNaN(amtNum) || amtNum <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (!spentOn.trim()) {
      setError("Please enter where you spent");
      return;
    }

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

  return (
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
  );
}
