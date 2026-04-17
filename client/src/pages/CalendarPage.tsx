import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";

type Shift = {
  id: number;
  employeeId: number;
  clockInTime: string;
  clockOutTime: string | null;
  regularHours: number | null;
  overtimeHours: number | null;
  totalPay: number | null;
  date: string;
  employee: { id: number; name: string; hourlyRate: number };
};

function formatHours(h: number | null | undefined) {
  if (!h) return "0h";
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return mins > 0 ? `${hours}h ${mins.toString().padStart(2, "0")}m` : `${hours}h`;
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  // Monday-based: 0=Mon, 6=Sun
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

export default function CalendarPage() {
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterEmployee, setFilterEmployee] = useState<number | "all">("all");

  const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: () => apiRequest("GET", "/api/employees").then(r => r.json()),
  });

  const { data: monthShifts = [] } = useQuery<Shift[]>({
    queryKey: ["/api/shifts/month", monthStr, filterEmployee],
    queryFn: () => {
      const empParam = filterEmployee !== "all" ? `&employeeId=${filterEmployee}` : "";
      return apiRequest("GET", `/api/shifts/month?month=${monthStr}${empParam}`).then(r => r.json());
    },
  });

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
    setSelectedDate(null);
  };

  // Build a map of date → shifts
  const shiftsByDate: Record<string, Shift[]> = {};
  for (const shift of monthShifts) {
    if (!shiftsByDate[shift.date]) shiftsByDate[shift.date] = [];
    shiftsByDate[shift.date].push(shift);
  }

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  // Monthly totals
  const monthTotalHours = monthShifts.reduce((s, sh) => s + (sh.regularHours || 0) + (sh.overtimeHours || 0), 0);
  const monthTotalPay = monthShifts.reduce((s, sh) => s + (sh.totalPay || 0), 0);
  const monthOTHours = monthShifts.reduce((s, sh) => s + (sh.overtimeHours || 0), 0);

  // Selected day shifts
  const selectedShifts = selectedDate ? (shiftsByDate[selectedDate] || []) : [];

  // CSV Export
  const exportCSV = () => {
    const rows = [
      ["Date", "Employee", "Clock In", "Clock Out", "Regular Hours", "Overtime Hours", "Total Pay (£)"],
      ...monthShifts
        .filter(s => s.clockOutTime)
        .map(s => [
          s.date,
          s.employee.name,
          formatTime(s.clockInTime),
          formatTime(s.clockOutTime),
          (s.regularHours || 0).toFixed(2),
          (s.overtimeHours || 0).toFixed(2),
          (s.totalPay || 0).toFixed(2),
        ])
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SYNCROLEC-hours-${monthStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // PDF Export (print-friendly)
  const exportPDF = () => {
    const empLabel = filterEmployee === "all" ? "All Employees" :
      (employees as any[]).find((e: any) => e.id === filterEmployee)?.name || "";

    const rows = monthShifts
      .filter(s => s.clockOutTime)
      .map(s => `
        <tr>
          <td>${s.date}</td>
          <td>${s.employee.name}</td>
          <td>${formatTime(s.clockInTime)}</td>
          <td>${formatTime(s.clockOutTime)}</td>
          <td>${formatHours(s.regularHours)}</td>
          <td style="color:${(s.overtimeHours || 0) > 0 ? '#d97706' : 'inherit'}">${formatHours(s.overtimeHours)}</td>
          <td><strong>£${(s.totalPay || 0).toFixed(2)}</strong></td>
        </tr>`).join("");

    const html = `<!DOCTYPE html>
<html><head><title>SYNCROLEC Hours — ${monthLabel}</title>
<style>
  body { font-family: sans-serif; font-size: 12px; color: #1a1a1a; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #666; margin-bottom: 20px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a3a2a; color: white; padding: 8px 10px; text-align: left; font-size: 11px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .totals { margin-top: 16px; display: flex; gap: 32px; }
  .totals div { background: #f3f3f3; padding: 10px 16px; border-radius: 6px; }
  .totals strong { display: block; font-size: 16px; }
  .totals span { font-size: 11px; color: #666; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>SYNCROLEC — Hours Report</h1>
  <div class="sub">${monthLabel} &nbsp;·&nbsp; ${empLabel}</div>
  <table>
    <thead><tr>
      <th>Date</th><th>Employee</th><th>Clock In</th><th>Clock Out</th>
      <th>Regular</th><th>Overtime</th><th>Pay</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><strong>${formatHours(monthTotalHours)}</strong><span>Total Hours</span></div>
    <div><strong style="color:#d97706">${formatHours(monthOTHours)}</strong><span>Overtime</span></div>
    <div><strong style="color:#1a6b3c">£${monthTotalPay.toFixed(2)}</strong><span>Total Pay</span></div>
  </div>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  };

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3">
          <Link href="/manager">
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" data-testid="button-back">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <div>
            <div className="text-sm font-bold text-foreground tracking-wider">SYNCROLEC</div>
            <div className="text-xs text-muted-foreground">Calendar View</div>
          </div>
        </div>
        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-secondary"
            data-testid="button-export-csv"
          >
            <Download size={13} />
            CSV
          </button>
          <button
            onClick={exportPDF}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
            data-testid="button-export-pdf"
          >
            <Download size={13} />
            PDF
          </button>
        </div>
      </header>

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">

        {/* Month nav + employee filter */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" data-testid="button-prev-month">
              <ChevronLeft size={18} className="text-muted-foreground" />
            </button>
            <span className="text-base font-semibold text-foreground min-w-[140px] text-center">{monthLabel}</span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" data-testid="button-next-month">
              <ChevronRight size={18} className="text-muted-foreground" />
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterEmployee("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterEmployee === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              data-testid="button-cal-filter-all"
            >All</button>
            {(employees as any[]).map((e: any) => (
              <button
                key={e.id}
                onClick={() => setFilterEmployee(e.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterEmployee === e.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                data-testid={`button-cal-filter-${e.id}`}
              >{e.name.split(" ")[0]}</button>
            ))}
          </div>
        </div>

        {/* Monthly KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Hours</div>
            <div className="text-base font-bold text-foreground">{formatHours(monthTotalHours)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Overtime</div>
            <div className={`text-base font-bold ${monthOTHours > 0 ? "text-yellow-400" : "text-foreground"}`}>{formatHours(monthOTHours)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Total Pay</div>
            <div className="text-base font-bold text-primary">£{monthTotalPay.toFixed(2)}</div>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {dayLabels.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }).map((_, i) => {
              const dayNum = i - firstDay + 1;
              const isValid = dayNum >= 1 && dayNum <= daysInMonth;
              const dateStr = isValid
                ? `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`
                : null;
              const dayShifts = dateStr ? (shiftsByDate[dateStr] || []) : [];
              const isToday = dateStr === today.toISOString().split("T")[0];
              const isSelected = dateStr === selectedDate;
              const totalHours = dayShifts.reduce((s, sh) => s + (sh.regularHours || 0) + (sh.overtimeHours || 0), 0);
              const hasOT = dayShifts.some(sh => (sh.overtimeHours || 0) > 0);
              const hasActive = dayShifts.some(sh => !sh.clockOutTime);
              const isWeekend = i % 7 >= 5;

              return (
                <div
                  key={i}
                  onClick={() => isValid && dateStr && setSelectedDate(isSelected ? null : dateStr)}
                  className={`
                    min-h-[52px] p-1.5 border-b border-r border-border/50 flex flex-col
                    ${!isValid ? "opacity-0 pointer-events-none" : "cursor-pointer"}
                    ${isWeekend && isValid ? "bg-secondary/30" : ""}
                    ${isSelected ? "bg-primary/15 border-primary/40" : isValid ? "hover:bg-secondary/60" : ""}
                    transition-colors
                  `}
                  data-testid={dateStr ? `cell-day-${dateStr}` : undefined}
                >
                  {isValid && (
                    <>
                      <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-0.5
                        ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                        {dayNum}
                      </div>
                      {dayShifts.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          <div className={`text-[10px] font-semibold leading-tight ${hasOT ? "text-yellow-400" : "text-primary"}`}>
                            {hasActive ? "Active" : formatHours(totalHours)}
                          </div>
                          {hasOT && <div className="text-[9px] text-yellow-400/80 leading-tight">OT</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected day detail */}
        {selectedDate && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3" data-testid="panel-day-detail">
            <h3 className="text-sm font-semibold text-foreground">
              {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            {selectedShifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shifts recorded</p>
            ) : (
              selectedShifts.map(shift => (
                <div key={shift.id} className="flex items-center justify-between py-2 border-t border-border first:border-0" data-testid={`detail-shift-${shift.id}`}>
                  <div>
                    <div className="text-sm font-medium text-foreground">{shift.employee.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatTime(shift.clockInTime)} → {shift.clockOutTime ? formatTime(shift.clockOutTime) : "still in"}
                    </div>
                    {(shift.overtimeHours || 0) > 0 && (
                      <div className="text-xs text-yellow-400 mt-0.5">
                        {formatHours(shift.overtimeHours)} overtime
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-foreground">
                      {formatHours((shift.regularHours || 0) + (shift.overtimeHours || 0))}
                    </div>
                    {shift.totalPay && (
                      <div className="text-xs text-primary">£{shift.totalPay.toFixed(2)}</div>
                    )}
                  </div>
                </div>
              ))
            )}
            {selectedShifts.length > 0 && selectedShifts.some(s => s.clockOutTime) && (
              <div className="pt-2 border-t border-border flex justify-between">
                <span className="text-xs text-muted-foreground">Day total</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-foreground mr-3">
                    {formatHours(selectedShifts.reduce((s, sh) => s + (sh.regularHours || 0) + (sh.overtimeHours || 0), 0))}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    £{selectedShifts.reduce((s, sh) => s + (sh.totalPay || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pb-2">
          Tap any day to see shift details · Green = hours worked · Yellow = overtime
        </p>
      </div>
    </div>
  );
}
