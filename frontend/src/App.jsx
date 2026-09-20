import { useState, useEffect, createContext, useContext, useCallback, useRef } from "react";
import { api } from "./api.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";
import AddExpense from "./components/AddExpense.jsx";
import ExpenseHistory from "./components/ExpenseHistory.jsx";
import Settings from "./components/Settings.jsx";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

const POLL_INTERVAL = 15000; // 15 seconds

export default function App() {
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState("dashboard");
  const [toast, setToast]       = useState("");
  const [editExpense, setEditExpense] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const lastFpRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Short polling for live updates (15s interval)
  useEffect(() => {
    if (!user) return;
    let active = true;

    const tick = async () => {
      try {
        const data = await api.poll();
        if (!active) return;
        if (lastFpRef.current !== null && data.fingerprint !== lastFpRef.current) {
          setRefreshTick((t) => t + 1);
        }
        lastFpRef.current = data.fingerprint;
      } catch {
        // ignore network errors during polling
      }
    };

    tick(); // seed initial fingerprint immediately
    const id = setInterval(tick, POLL_INTERVAL);
    return () => { active = false; clearInterval(id); };
  }, [user]);

  const handleLogin = (userData) => {
    setUser(userData);
    lastFpRef.current = null;
    setView("dashboard");
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    lastFpRef.current = null;
  };

  const handleEditExpense = (expense) => {
    setEditExpense(expense);
    setView("add");
  };

  const handleExpenseSaved = () => {
    setEditExpense(null);
    setView("dashboard");
    showToast(editExpense ? "Expense updated" : "Expense added");
    setRefreshTick((t) => t + 1);
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <AuthContext.Provider value={{ user, logout: handleLogout }}>
      <ToastContext.Provider value={showToast}>
        <div className="app-container">
          <header className="app-header">
            <h1>
              {view === "dashboard" && "💸 Expenses"}
              {view === "add" && (editExpense ? "✏️ Edit Expense" : "➕ Add Expense")}
              {view === "history" && "📋 History"}
              {view === "settings" && "⚙️ Settings"}
            </h1>
            <div className="header-actions">
              {view !== "add" && (
                <button
                  className="header-btn"
                  onClick={() => { setEditExpense(null); setView("add"); }}
                >
                  + Add
                </button>
              )}
            </div>
          </header>

          <div className="app-content">
            {view === "dashboard" && (
              <Dashboard onEdit={handleEditExpense} refreshTick={refreshTick} />
            )}
            {view === "add" && (
              <AddExpense
                expense={editExpense}
                onSaved={handleExpenseSaved}
                onCancel={() => { setEditExpense(null); setView("dashboard"); }}
              />
            )}
            {view === "history" && (
              <ExpenseHistory onEdit={handleEditExpense} />
            )}
            {view === "settings" && (
              <Settings />
            )}
          </div>

          <nav className="app-nav">
            {[
              { key: "dashboard", icon: "🏠", label: "Home" },
              { key: "add",       icon: "➕", label: "Add"  },
              { key: "history",   icon: "📋", label: "History" },
              { key: "settings",  icon: "⚙️", label: "Settings" },
            ].map((item) => (
              <button
                key={item.key}
                className={`nav-btn${view === item.key ? " active" : ""}`}
                onClick={() => {
                  if (item.key === "add") setEditExpense(null);
                  setView(item.key);
                }}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <Toast message={toast} />
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}
