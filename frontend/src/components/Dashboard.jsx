import { useState, useEffect, useCallback } from "react";
import { api } from "../api.js";
import WeeklyBudget from "./WeeklyBudget.jsx";
import CalendarView from "./CalendarView.jsx";
import ExpenseItem from "./ExpenseItem.jsx";

function getPKTToday() {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(pkt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function dayLabel(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const today = getPKTToday();
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000 - 86400000);
  const yest = `${pkt.getUTCFullYear()}-${String(pkt.getUTCMonth()+1).padStart(2,"0")}-${String(pkt.getUTCDate()).padStart(2,"0")}`;
  if (dateStr === today) return "Today";
  if (dateStr === yest) return "Yesterday";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export default function Dashboard({ onEdit, refreshTick }) {
  const today = getPKTToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayExpenses, setDayExpenses] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayTotal, setDayTotal] = useState(0);

  const loadDay = useCallback((date) => {
    setDayLoading(true);
    api.listExpenses({ from: date, to: date, limit: 200 })
      .then((data) => {
        setDayExpenses(data);
        setDayTotal(data.reduce((s, e) => s + parseFloat(e.amount_pkr), 0));
      })
      .catch(console.error)
      .finally(() => setDayLoading(false));
  }, []);

  useEffect(() => { loadDay(today); }, []);

  useEffect(() => {
    if (refreshTick > 0) loadDay(selectedDate);
  }, [refreshTick]);

  const handleDaySelect = (date) => {
    setSelectedDate(date);
    loadDay(date);
  };

  const fmt = (n) => n.toLocaleString("en-PK", { maximumFractionDigits: 0 });

  return (
    <div>
      <WeeklyBudget refreshTick={refreshTick} />

      <CalendarView
        onDaySelect={handleDaySelect}
        selectedDate={selectedDate}
        refreshTick={refreshTick}
      />

      <div className="day-detail">
        <div className="day-detail-header">
          <span className="day-detail-title">{dayLabel(selectedDate)}</span>
          {dayExpenses.length > 0 && (
            <span className="day-detail-total">₨{fmt(dayTotal)}</span>
          )}
        </div>

        {dayLoading ? (
          <div className="loading">Loading…</div>
        ) : dayExpenses.length === 0 ? (
          <div className="day-empty">No expenses on this day</div>
        ) : (
          <div className="card">
            <div className="card-body">
              {dayExpenses.map((exp) => (
                <ExpenseItem
                  key={exp.id}
                  expense={exp}
                  onEdit={onEdit}
                  onDeleted={() => loadDay(selectedDate)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
