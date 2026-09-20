import { useState, useEffect } from "react";
import { api } from "../api.js";
import { useAuth, useToast } from "../App.jsx";

function fmt(pkr) {
  return parseFloat(pkr).toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export default function Settings() {
  const { user, logout } = useAuth();
  const showToast = useToast();

  // Password change
  const [current, setCurrent]   = useState("");
  const [newPw, setNewPw]       = useState("");
  const [confirm, setConfirm]   = useState("");
  const [pwError, setPwError]   = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);

  // Weekly budget
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetInfo, setBudgetInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    api.getBudget()
      .then((b) => {
        setBudgetInfo(b);
        if (b.budget_configured) {
          setBudgetInput(parseFloat(b.budget_pkr).toFixed(0));
        }
      })
      .catch(() => {});
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (newPw !== confirm) { setPwError("Passwords do not match"); return; }
    if (newPw.length < 8) { setPwError("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    try {
      await api.changePassword(current, newPw);
      showToast("Password changed successfully");
      setCurrent(""); setNewPw(""); setConfirm("");
      setShowPwForm(false);
    } catch (err) {
      setPwError(err.message || "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  const handleSaveBudget = async (e) => {
    e.preventDefault();
    setBudgetSaving(true);
    try {
      const b = await api.updateBudget(budgetInput || "0");
      setBudgetInfo(b);
      showToast(parseFloat(budgetInput) > 0 ? "Weekly budget saved" : "Budget cleared");
    } catch (err) {
      showToast(err.message || "Failed to save budget");
    } finally {
      setBudgetSaving(false);
    }
  };

  const loadHistory = async () => {
    try {
      const h = await api.budgetHistory();
      setHistory(h);
      setShowHistory(true);
    } catch {
      showToast("Could not load history");
    }
  };

  return (
    <div>
      {/* ── Account ── */}
      <div className="card mb-20">
        <div className="card-body">
          <div className="section-title" style={{ marginBottom: 12 }}>Account</div>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>{user.name}</div>
          <div className="text-muted">{user.email}</div>
        </div>
      </div>

      {/* ── Weekly Budget ── */}
      <div className="card mb-20">
        <div className="card-body">
          <div className="section-title" style={{ marginBottom: 12 }}>Weekly Budget</div>
          <p className="text-muted" style={{ marginBottom: 14 }}>
            Set a 7-day spending limit. Warnings appear at 70%, 90%, and 100%.
          </p>
          <form onSubmit={handleSaveBudget}>
            <div className="form-group">
              <label className="form-label">Budget Amount (PKR)</label>
              <div className="input-prefix">
                <input
                  className="form-input amount-input"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 5000"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <p className="text-muted" style={{ marginTop: 4 }}>Set to 0 to disable the budget feature.</p>
            </div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={budgetSaving} style={{ width: "auto" }}>
              {budgetSaving ? "Saving…" : "Save Budget"}
            </button>
          </form>

          {budgetInfo && budgetInfo.budget_configured && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--gray-100)" }}>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Current period: {budgetInfo.week_start} → {budgetInfo.week_end}
              </div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                Spent: ₨{fmt(budgetInfo.spent_pkr)} / ₨{fmt(budgetInfo.budget_pkr)} ({budgetInfo.percent_used.toFixed(0)}%)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Budget History ── */}
      {budgetInfo && budgetInfo.budget_configured && (
        <div className="card mb-20">
          <div className="card-body">
            <div className="section-title" style={{ marginBottom: 12 }}>Budget History</div>
            {!showHistory ? (
              <button className="btn btn-outline btn-sm" onClick={loadHistory} style={{ width: "auto" }}>
                Show Past Weeks
              </button>
            ) : history.length === 0 ? (
              <p className="text-muted">No completed weeks yet.</p>
            ) : (
              <div>
                {history.map((h) => (
                  <div key={h.week_start} style={{ padding: "10px 0", borderBottom: "1px solid var(--gray-100)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{h.week_start} → {h.week_end}</div>
                        <div className="text-muted">Budget: ₨{fmt(h.budget_pkr)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700 }}>₨{fmt(h.spent_pkr)}</div>
                        <div className={`text-muted ${h.percent_used >= 100 ? "text-red" : ""}`}>
                          {h.percent_used.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Security ── */}
      <div className="card mb-20">
        <div className="card-body">
          <div className="section-title" style={{ marginBottom: 12 }}>Security</div>
          {!showPwForm ? (
            <button className="btn btn-outline" onClick={() => setShowPwForm(true)}>
              🔑 Change Password
            </button>
          ) : (
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input className="form-input" type="password" value={current}
                  onChange={(e) => setCurrent(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" value={newPw}
                  onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              {pwError && <p className="form-error">{pwError}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" type="submit" disabled={pwSaving}>
                  {pwSaving ? "Saving…" : "Update Password"}
                </button>
                <button className="btn btn-outline" type="button"
                  onClick={() => { setShowPwForm(false); setPwError(""); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <button className="btn btn-danger" onClick={logout}>Sign Out</button>
    </div>
  );
}
