import { useState } from "react";
import { api } from "../api.js";
import { useToast } from "../App.jsx";

const PKT_OFFSET = 5 * 60; // minutes

function formatPKT(isoStr) {
  if (!isoStr) return "";
  // Parse the stored datetime (already in PKT) and display it
  const dt = new Date(isoStr.includes("T") ? isoStr : isoStr + "T00:00:00");
  // The stored value is PKT, so we treat it as-is
  const parts = isoStr.split("T");
  const datePart = parts[0];
  const timePart = parts[1] ? parts[1].substring(0, 5) : "";

  const [y, m, d] = datePart.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dateStr = `${parseInt(d)} ${months[parseInt(m) - 1]}`;

  if (!timePart) return dateStr;

  const [h, min] = timePart.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${dateStr} · ${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

function formatAmount(pkr) {
  const n = parseFloat(pkr);
  return "₨" + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export default function ExpenseItem({ expense, onEdit, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const showToast = useToast();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteExpense(expense.id);
      showToast("Expense deleted");
      onDeleted();
    } catch {
      showToast("Delete failed");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="expense-item">
        <div className="expense-left">
          <div className="expense-spent-on">{expense.spent_on}</div>
          <div className="expense-meta">
            {expense.category && <span className="expense-category">{expense.category}</span>}
            {expense.note && <span className="expense-note">{expense.note}</span>}
          </div>
          <div className="expense-meta">{formatPKT(expense.expense_datetime)}</div>
        </div>
        <div className="expense-right">
          <div className="expense-amount">{formatAmount(expense.amount_pkr)}</div>
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 6 }}>
            <button className="btn-icon" title="Edit" onClick={() => onEdit(expense)}>✏️</button>
            <button className="btn-icon" title="Delete" onClick={() => setConfirming(true)}>🗑️</button>
          </div>
        </div>
      </div>

      {confirming && (
        <div className="overlay" onClick={() => setConfirming(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">Delete Expense?</div>
            <p className="text-muted">
              "{expense.spent_on}" · {formatAmount(expense.amount_pkr)} — this cannot be undone.
            </p>
            <div className="sheet-btns">
              <button className="btn btn-outline" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
