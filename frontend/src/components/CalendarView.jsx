import { useState, useEffect } from "react";
import { api } from "../api.js";

function getPKTToday() {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return {
    year: pkt.getUTCFullYear(),
    month: pkt.getUTCMonth() + 1,
    day: pkt.getUTCDate(),
  };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function firstDayOfWeek(year, month) {
  // Returns 0=Sun, adjust to Mon-first: Mon=0..Sun=6
  const raw = new Date(year, month - 1, 1).getDay();
  return (raw + 6) % 7;
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_HEADERS = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function fmtAmount(pkr) {
  const n = parseFloat(pkr);
  if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export default function CalendarView({ onDaySelect, selectedDate, refreshTick }) {
  const today = getPKTToday();
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);
  const [calData, setCalData] = useState({});
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.calendarMonth(year, month)
      .then((days) => {
        const map = {};
        days.forEach((d) => { map[d.date] = d; });
        setCalData(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year, month]);
  useEffect(() => { if (refreshTick > 0) load(); }, [refreshTick]);

  const canGoNext = !(year === today.year && month === today.month);

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (!canGoNext) return;
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };

  const numDays = daysInMonth(year, month);
  const startPad = firstDayOfWeek(year, month); // 0=Mon

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) cells.push(d);

  return (
    <div className="calendar-wrap">
      <div className="cal-header">
        <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
        <span className="cal-month-title">{MONTH_NAMES[month - 1]} {year}</span>
        <button className="cal-nav-btn" onClick={nextMonth} disabled={!canGoNext}>›</button>
      </div>

      <div className="cal-grid">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="cal-day-name">{d}</div>
        ))}

        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} className="cal-cell cal-cell-empty" />;

          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const data = calData[dateStr];
          const isToday = year === today.year && month === today.month && day === today.day;
          const isSelected = selectedDate === dateStr;
          const isFuture =
            year > today.year ||
            (year === today.year && month > today.month) ||
            (year === today.year && month === today.month && day > today.day);

          let cls = "cal-cell";
          if (isToday) cls += " cal-today";
          if (isSelected) cls += " cal-selected";
          if (data) cls += " cal-has-data";
          if (isFuture) cls += " cal-future";

          return (
            <div
              key={dateStr}
              className={cls}
              onClick={() => !isFuture && onDaySelect(dateStr)}
            >
              <div className="cal-day-num">{day}</div>
              {data && !loading && (
                <div className="cal-amount">₨{fmtAmount(data.total_pkr)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
