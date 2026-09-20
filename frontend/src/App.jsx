import { useState, useEffect, createContext, useContext, useCallback } from "react";
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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [toast, setToast] = useState("");
  const [editExpense, setEditExpense] = useState(null);

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

  const handleLogin = (userData) => {
    setUser(userData);
    setView("dashboard");
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  const handleEditExpense = (expense) => {
    setEditExpense(expense);
    setView("add");
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
                <button className="header-btn" onClick={() => { setEditExpense(null); setView("add"); }}>
                  + Add
                </button>
              )}
            </div>
          </header>

          <div className="app-content">
            {view === "dashboard" && (
              <Dashboard onEdit={handleEditExpense} />
            )}
            {view === "add" && (
              <AddExpense
                expense={editExpense}
                onSaved={() => { setEditExpense(null); setView("dashboard"); showToast(editExpense ? "Expense updated" : "Expense added"); }}
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
              { key: "add", icon: "➕", label: "Add" },
              { key: "history", icon: "📋", label: "History" },
              { key: "settings", icon: "⚙️", label: "Settings" },
            ].map((item) => (
              <button
                key={item.key}
                className={`nav-btn${view === item.key ? " active" : ""}`}
                onClick={() => { if (item.key === "add") setEditExpense(null); setView(item.key); }}
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
