import { useState } from "react";
import { api } from "../api.js";
import { useAuth, useToast } from "../App.jsx";

export default function Settings() {
  const { user, logout } = useAuth();
  const showToast = useToast();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");
    if (newPw !== confirm) { setError("Passwords do not match"); return; }
    if (newPw.length < 8) { setError("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.changePassword(current, newPw);
      showToast("Password changed successfully");
      setCurrent(""); setNewPw(""); setConfirm("");
      setShowForm(false);
    } catch (err) {
      setError(err.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card mb-20">
        <div className="card-body">
          <div className="section-title" style={{ marginBottom: 12 }}>Account</div>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>{user.name}</div>
          <div className="text-muted">{user.email}</div>
        </div>
      </div>

      <div className="card mb-20">
        <div className="card-body">
          <div className="section-title" style={{ marginBottom: 12 }}>Security</div>
          {!showForm ? (
            <button className="btn btn-outline" onClick={() => setShowForm(true)}>
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
              {error && <p className="form-error">{error}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Update Password"}
                </button>
                <button className="btn btn-outline" type="button" onClick={() => { setShowForm(false); setError(""); }}>
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
