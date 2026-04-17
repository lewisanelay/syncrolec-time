import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  Clock, Users, TrendingUp, PoundSterling, ArrowLeft,
  CalendarDays, ChevronLeft, ChevronRight, Trash2, AlertTriangle, Pencil, Check, X, Calendar
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAutoBackup } from "@/hooks/useAutoBackup";
import { loadBackup, formatBackupDate } from "@/lib/localBackup";

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function formatDate(isoString: string | null | undefined) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatTime(isoString: string | null | undefined) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatHours(h: number | null | undefined) {
  if (!h) return "0h 00m";
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${mins.toString().padStart(2, "0")}m`;
}

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

export default function ManagerPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { triggerBackup } = useAutoBackup();
  const backup = loadBackup();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [filterEmployee, setFilterEmployee] = useState<number | "all">("all");
  const [editShift, setEditShift] = useState<any>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(getMonday(d));
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(getMonday(d));
  };

  const { data: status = [] } = useQuery({
    queryKey: ["/api/status"],
    queryFn: () => apiRequest("GET", "/api/status").then(r => r.json()),
    refetchInterval: 15000,
  });

  const { data: summary = [] } = useQuery({
    queryKey: ["/api/summary", toDateStr(weekStart)],
    queryFn: () => apiRequest("GET", `/api/summary?weekStart=${toDateStr(weekStart)}`).then(r => r.json()),
  });

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ["/api/shifts", filterEmployee, toDateStr(weekStart), toDateStr(weekEnd)],
    queryFn: () => {
      const empParam = filterEmployee !== "all" ? `&employeeId=${filterEmployee}` : "";
      return apiRequest("GET", `/api/shifts?startDate=${toDateStr(weekStart)}&endDate=${toDateStr(weekEnd)}${empParam}`).then(r => r.json());
    },
  });

  const deleteShift = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/shifts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      qc.invalidateQueries({ queryKey: ["/api/summary"] });
      toast({ title: "Shift deleted" });
      triggerBackup();
    },
  });

  const editShiftMut = useMutation({
    mutationFn: ({ id, clockInTime, clockOutTime }: { id: number; clockInTime: string; clockOutTime?: string }) =>
      apiRequest("PATCH", `/api/shifts/${id}`, { clockInTime, clockOutTime }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      qc.invalidateQueries({ queryKey: ["/api/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/status"] });
      toast({ title: "Shift updated" });
      setEditShift(null);
      triggerBackup();
    },
    onError: () => toast({ title: "Failed to update shift", variant: "destructive" }),
  });

  // Convert ISO string to local datetime-local input value
  function toLocalInput(iso: string | null | undefined) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Convert local datetime-local value back to ISO
  function fromLocalInput(val: string) {
    return new Date(val).toISOString();
  }

  function openEdit(shift: any) {
    setEditShift(shift);
    setEditClockIn(toLocalInput(shift.clockInTime));
    setEditClockOut(toLocalInput(shift.clockOutTime));
  }

  function saveEdit() {
    if (!editShift || !editClockIn) return;
    editShiftMut.mutate({
      id: editShift.id,
      clockInTime: fromLocalInput(editClockIn),
      clockOutTime: editClockOut ? fromLocalInput(editClockOut) : undefined,
    });
  }

  const totalWeekHours = summary.reduce((s: number, e: any) => s + (e.totalHours || 0), 0);
  const totalWeekPay = summary.reduce((s: number, e: any) => s + (e.totalPay || 0), 0);
  const totalOvertimeHours = summary.reduce((s: number, e: any) => s + (e.overtimeHours || 0), 0);
  const currentlyIn = status.filter((e: any) => e.currentlyClocked).length;

  const employees = status.map((e: any) => ({ id: e.id, name: e.name }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" data-testid="button-back">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <div>
            <div className="text-sm font-bold text-foreground tracking-wider">SYNCROLEC</div>
            <div className="text-xs text-muted-foreground">Manager Dashboard</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/calendar">
            <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-secondary" data-testid="link-calendar">
              <Calendar size={15} />
              Calendar
            </button>
          </Link>
          <Link href="/employees">
            <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-secondary" data-testid="link-employees">
              <Users size={15} />
              Employees
            </button>
          </Link>
        </div>
      </header>

      {/* Backup status bar */}
      {backup && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-border text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
          Local backup saved · {formatBackupDate(backup.savedAt)} · {backup.shifts.length} shift{backup.shifts.length !== 1 ? "s" : ""}
        </div>
      )}

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">

        {/* Live Status */}
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Live Status</h2>
          <div className="space-y-2">
            {status.map((emp: any) => (
              <div key={emp.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3" data-testid={`card-status-${emp.id}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${emp.currentlyClocked ? "bg-primary clocked-in-pulse" : "bg-border"}`} />
                  <div>
                    <div className="text-sm font-medium text-foreground">{emp.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {emp.currentlyClocked
                        ? `Clocked in at ${formatTime(emp.lastClockIn)}`
                        : "Not clocked in"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {emp.currentlyClocked ? (
                    <Badge variant="outline" className="border-primary/50 text-primary text-xs">On Site</Badge>
                  ) : (
                    <Badge variant="outline" className="border-border text-muted-foreground text-xs">Off Site</Badge>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">{formatHours(emp.todayHours)} today</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-card border-border" data-testid="card-kpi-hours">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Week Hours</span>
              </div>
              <div className="text-xl font-bold text-foreground">{formatHours(totalWeekHours)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border" data-testid="card-kpi-pay">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <PoundSterling size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Week Pay</span>
              </div>
              <div className="text-xl font-bold text-primary">£{totalWeekPay.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border" data-testid="card-kpi-overtime">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Overtime</span>
              </div>
              <div className={`text-xl font-bold ${totalOvertimeHours > 0 ? "text-yellow-400" : "text-foreground"}`}>
                {formatHours(totalOvertimeHours)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border" data-testid="card-kpi-onsite">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">On Site Now</span>
              </div>
              <div className={`text-xl font-bold ${currentlyIn > 0 ? "text-primary" : "text-foreground"}`}>
                {currentlyIn} / {status.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Shifts log */}
        <div>
          {/* Week nav + filter */}
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shift Log</h2>
            <div className="flex items-center gap-2">
              <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" data-testid="button-prev-week">
                <ChevronLeft size={16} className="text-muted-foreground" />
              </button>
              <span className="text-xs text-foreground font-medium">{weekLabel}</span>
              <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" data-testid="button-next-week">
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Employee filter */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <button
              onClick={() => setFilterEmployee("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterEmployee === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              data-testid="button-filter-all"
            >
              All
            </button>
            {employees.map((e: any) => (
              <button
                key={e.id}
                onClick={() => setFilterEmployee(e.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterEmployee === e.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                data-testid={`button-filter-${e.id}`}
              >
                {e.name.split(" ")[0]}
              </button>
            ))}
          </div>

          {/* Weekly breakdown per employee */}
          {summary.length > 0 && (
            <div className="space-y-2 mb-4">
              {summary
                .filter((s: any) => filterEmployee === "all" || s.employee.id === filterEmployee)
                .map((s: any) => (
                <div key={s.employee.id} className="bg-card border border-border rounded-xl px-4 py-3" data-testid={`card-summary-${s.employee.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{s.employee.name}</span>
                    <span className="text-sm font-bold text-primary">£{(s.totalPay || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex gap-4 mt-2">
                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{formatHours(s.totalHours)}</span> total
                    </div>
                    {(s.overtimeHours || 0) > 0 && (
                      <div className="text-xs text-yellow-400">
                        <AlertTriangle size={10} className="inline mr-1" />
                        {formatHours(s.overtimeHours)} OT
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">{s.shifts} shift{s.shifts !== 1 ? "s" : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Individual shifts */}
          {shiftsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : shifts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <CalendarDays size={32} className="mx-auto mb-2 opacity-40" />
              No shifts this week
            </div>
          ) : (
            <div className="space-y-2">
              {shifts.map((shift: any) => (
                <div key={shift.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3" data-testid={`row-shift-${shift.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{shift.employee?.name}</span>
                      {!shift.clockOutTime && (
                        <Badge className="bg-primary/20 text-primary border-0 text-xs">Active</Badge>
                      )}
                      {(shift.overtimeHours || 0) > 0 && (
                        <Badge className="bg-yellow-400/15 text-yellow-400 border-0 text-xs">OT</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(shift.clockInTime)} · {formatTime(shift.clockInTime)} → {shift.clockOutTime ? formatTime(shift.clockOutTime) : "still in"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <div className="text-right">
                      {shift.clockOutTime ? (
                        <>
                          <div className="text-xs font-medium text-foreground">{formatHours((shift.regularHours || 0) + (shift.overtimeHours || 0))}</div>
                          <div className="text-xs text-primary">£{(shift.totalPay || 0).toFixed(2)}</div>
                        </>
                      ) : (
                        <div className="text-xs text-primary">In progress</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(shift)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                        data-testid={`button-edit-shift-${shift.id}`}
                      >
                        <Pencil size={13} />
                      </button>
                    {shift.clockOutTime && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground" data-testid={`button-delete-shift-${shift.id}`}>
                            <Trash2 size={14} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {shift.employee?.name} — {formatDate(shift.clockInTime)}, {formatTime(shift.clockInTime)} → {formatTime(shift.clockOutTime)}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-secondary border-border">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground"
                              onClick={() => deleteShift.mutate(shift.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Shift Dialog */}
      <Dialog open={!!editShift} onOpenChange={(open) => { if (!open) setEditShift(null); }}>
        <DialogContent className="bg-card border-border max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">
              Edit Shift — {editShift?.employee?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Clock-In Time</label>
              <input
                type="datetime-local"
                value={editClockIn}
                onChange={e => setEditClockIn(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                data-testid="input-edit-clock-in"
              />
            </div>
            {editShift?.clockOutTime && (
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Clock-Out Time</label>
                <input
                  type="datetime-local"
                  value={editClockOut}
                  onChange={e => setEditClockOut(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  data-testid="input-edit-clock-out"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Pay and overtime will be automatically recalculated after saving.</p>
          </div>
          <DialogFooter className="flex gap-2">
            <button
              onClick={() => setEditShift(null)}
              className="flex-1 flex items-center justify-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
              data-testid="button-edit-cancel"
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={!editClockIn || editShiftMut.isPending}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="button-edit-save"
            >
              <Check size={14} /> {editShiftMut.isPending ? "Saving..." : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
