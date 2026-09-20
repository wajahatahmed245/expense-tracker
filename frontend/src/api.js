const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  me: () => request("/auth/me"),
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  logout: () => request("/auth/logout", { method: "POST" }),
  changePassword: (current_password, new_password) =>
    request("/auth/change-password", { method: "POST", body: { current_password, new_password } }),

  dashboard: () => request("/dashboard"),
  categories: () => request("/categories"),

  listExpenses: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
    ).toString();
    return request(`/expenses${qs ? "?" + qs : ""}`);
  },
  createExpense: (payload) => request("/expenses", { method: "POST", body: payload }),
  updateExpense: (id, payload) => request(`/expenses/${id}`, { method: "PUT", body: payload }),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: "DELETE" }),

  getBudget: () => request("/budget"),
  updateBudget: (weekly_budget) => request("/budget", { method: "PUT", body: { weekly_budget: String(weekly_budget) } }),
  budgetHistory: () => request("/budget/history"),

  calendarMonth: (year, month) =>
    request(`/calendar/${year}/${String(month).padStart(2, "0")}`),

  poll: () => request("/poll"),
};
