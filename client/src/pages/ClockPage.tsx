import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Delete, LayoutDashboard, CheckCircle, XCircle, LogIn, LogOut, Pencil, Check, X, CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import MyHoursPage from "@/pages/MyHoursPage";
import { useAutoBackup } from "@/hooks/useAutoBackup";

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(isoStart: string) {
  const elapsed = Date.now() - new Date(isoStart).getTime();
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatHours(h: number) {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${mins.toString().padStart(2, "0")}m`;
}

// Convert ISO → datetime-local input value (local time)
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(val: string) {
  return new Date(val).toISOString();
}

export default function ClockPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { triggerBackup } = useAutoBackup();
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<null | "in" | "out" | "error">(null);
  const [resultData, setResultData] = useState<any>(null);
  const [now, setNow] = useState(new Date());

  // My Hours view state
  const [hoursStep, setHoursStep] = useState<"idle" | "pin" | "view">("idle");
  const [hoursPin, setHoursPin] = useState("");
  const [hoursPinError, setHoursPinError] = useState(false);
  const [hoursEmployee, setHoursEmployee] = useState<any>(null);

  // Edit-my-shift state — requires PIN verification first
  const [editStep, setEditStep] = useState<"idle" | "pin" | "form">("idle");
  const [editPin, setEditPin] = useState("");
  const [editPinError, setEditPinError] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any>(null);
  const [editShift, setEditShift] = useState<any>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/status"],
    queryFn: () => apiRequest("GET", "/api/status").then((r) => r.json()),
    refetchInterval: 10000,
  });

  const clockInMut = useMutation({
    mutationFn: (p: string) => apiRequest("POST", "/api/clock-in", { pin: p }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/status"] });
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      setResult(data.error ? "error" : "in");
      setResultData(data);
      setPin("");
      if (!data.error) triggerBackup();
    },
  });

  const clockOutMut = useMutation({
    mutationFn: (p: string) => apiRequest("POST", "/api/clock-out", { pin: p }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/status"] });
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      setResult(data.error ? "error" : "out");
      setResultData(data);
      setPin("");
      if (!data.error) triggerBackup();
    },
  });

  // Fetch most recent shift for a verified employee
  const fetchLatestShift = async (employeeId: number) => {
    const shifts = await apiRequest("GET", `/api/shifts?employeeId=${employeeId}`).then(r => r.json());
    return shifts[0] ?? null; // already ordered by most recent
  };

  const editShiftMut = useMutation({
    mutationFn: ({ id, clockInTime, clockOutTime }: { id: number; clockInTime: string; clockOutTime?: string }) =>
      apiRequest("PATCH", `/api/shifts/${id}`, { clockInTime, clockOutTime }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shifts"] });
      qc.invalidateQueries({ queryKey: ["/api/status"] });
      toast({ title: "Shift updated" });
      closeEditModal();
      triggerBackup();
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const handleClockIn = () => { if (pin.length < 4) return; clockInMut.mutate(pin); };
  const handleClockOut = () => { if (pin.length < 4) return; clockOutMut.mutate(pin); };

  const handlePinPress = (digit: string) => {
    if (pin.length >= 4) return;
    setPin((p) => p + digit);
    if (result) { setResult(null); setResultData(null); }
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    if (result) { setResult(null); setResultData(null); }
  };

  // Edit PIN keypad handlers (separate from clock-in/out PIN)
  const handleEditPinPress = (digit: string) => {
    if (editPin.length >= 4) return;
    setEditPin(p => p + digit);
    setEditPinError(false);
  };

  const handleEditPinDelete = () => setEditPin(p => p.slice(0, -1));

  // My Hours PIN handlers
  const handleHoursPinPress = (digit: string) => {
    if (hoursPin.length >= 4) return;
    setHoursPin(p => p + digit);
    setHoursPinError(false);
  };
  const handleHoursPinDelete = () => setHoursPin(p => p.slice(0, -1));

  const verifyHoursPin = () => {
    const emp = (employees as any[]).find((e: any) => e.pin === hoursPin);
    if (!emp) {
      setHoursPinError(true);
      setHoursPin("");
      return;
    }
    setHoursEmployee(emp);
    setHoursStep("view");
  };

  const closeHours = () => {
    setHoursStep("idle");
    setHoursPin("");
    setHoursPinError(false);
    setHoursEmployee(null);
  };

  const verifyEditPin = async () => {
    // Check PIN against employees list
    const emp = (employees as any[]).find((e: any) => e.pin === editPin);
    if (!emp) {
      setEditPinError(true);
      setEditPin("");
      return;
    }
    // Fetch their most recent shift
    const shift = await fetchLatestShift(emp.id);
    if (!shift) {
      toast({ title: "No shifts found to edit", variant: "destructive" });
      closeEditModal();
      return;
    }
    setEditEmployee(emp);
    setEditShift(shift);
    setEditClockIn(toLocalInput(shift.clockInTime));
    setEditClockOut(toLocalInput(shift.clockOutTime));
    setEditStep("form");
  };

  const saveEdit = () => {
    if (!editShift || !editClockIn) return;
    editShiftMut.mutate({
      id: editShift.id,
      clockInTime: fromLocalInput(editClockIn),
      clockOutTime: editClockOut ? fromLocalInput(editClockOut) : undefined,
    });
  };

  const closeEditModal = () => {
    setEditStep("idle");
    setEditPin("");
    setEditPinError(false);
    setEditEmployee(null);
    setEditShift(null);
    setEditClockIn("");
    setEditClockOut("");
  };

  const isPending = clockInMut.isPending || clockOutMut.isPending;

  // Full-screen My Hours view
  if (hoursStep === "view" && hoursEmployee) {
    return <MyHoursPage employeeId={hoursEmployee.id} employeeName={hoursEmployee.name} onBack={closeHours} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <svg aria-label="SYNCROLEC" viewBox="0 0 40 40" fill="none" className="w-9 h-9">
            <rect width="40" height="40" rx="8" fill="hsl(152, 70%, 40%)" />
            <path d="M10 27 L14 13 L20 22 L26 13 L30 27" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="20" cy="22" r="2" fill="white"/>
          </svg>
          <div>
            <div className="text-sm font-bold text-foreground tracking-wider">SYNCROLEC</div>
            <div className="text-xs text-muted-foreground">Time Tracker</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setHoursStep("pin"); setHoursPin(""); setHoursPinError(false); }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-secondary"
            data-testid="button-my-hours"
          >
            <CalendarDays size={14} />
            My Hours
          </button>
          <button
            onClick={() => { setEditStep("pin"); setEditPin(""); setEditPinError(false); }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-secondary"
            data-testid="button-edit-my-shift"
          >
            <Pencil size={14} />
            Edit Shift
          </button>
          <Link href="/manager">
            <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-secondary" data-testid="link-manager">
              <LayoutDashboard size={15} />
              Manager
            </button>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start px-4 pt-6 pb-8 gap-6">
        {/* Live Clock */}
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums text-foreground" data-testid="text-live-clock">
            {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Currently Clocked-In Cards */}
        {employees.filter((e: any) => e.currentlyClocked).length > 0 && (
          <div className="w-full max-w-sm space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-1">Currently On Site</p>
            {employees.filter((e: any) => e.currentlyClocked).map((emp: any) => (
              <div key={emp.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3" data-testid={`card-clocked-${emp.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary clocked-in-pulse" />
                  <div>
                    <div className="text-sm font-medium text-foreground">{emp.name}</div>
                    <div className="text-xs text-muted-foreground">In since {formatTime(emp.lastClockIn)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-primary" data-testid={`text-duration-${emp.id}`}>
                    {emp.lastClockIn ? formatDuration(emp.lastClockIn) : "--"}
                  </div>
                  <div className="text-xs text-muted-foreground">today</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Result messages */}
        {result === "in" && resultData && !resultData.error && (
          <div className="w-full max-w-sm bg-primary/10 border border-primary/30 rounded-2xl px-5 py-4 text-center" data-testid="status-clock-in-success">
            <CheckCircle className="mx-auto text-primary mb-2" size={32} />
            <div className="text-base font-semibold text-foreground">Good morning, {resultData.employee?.name?.split(" ")[0]}!</div>
            <div className="text-sm text-muted-foreground mt-1">Clocked in at {formatTime(resultData.shift?.clockInTime)}</div>
          </div>
        )}
        {result === "out" && resultData && !resultData.error && (
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl px-5 py-4 text-center" data-testid="status-clock-out-success">
            <CheckCircle className="mx-auto text-primary mb-2" size={32} />
            <div className="text-base font-semibold text-foreground">See you, {resultData.employee?.name?.split(" ")[0]}!</div>
            <div className="text-sm text-muted-foreground mt-1">Clocked out at {formatTime(resultData.shift?.clockOutTime)}</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="bg-secondary rounded-lg p-2">
                <div className="text-xs text-muted-foreground">Regular</div>
                <div className="text-sm font-semibold text-foreground">{formatHours(resultData.regularHours || 0)}</div>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <div className="text-xs text-muted-foreground">Overtime</div>
                <div className={`text-sm font-semibold ${(resultData.overtimeHours || 0) > 0 ? "text-yellow-400" : "text-foreground"}`}>
                  {formatHours(resultData.overtimeHours || 0)}
                </div>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <div className="text-xs text-muted-foreground">Pay</div>
                <div className="text-sm font-semibold text-primary">£{(resultData.totalPay || 0).toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
        {result === "error" && resultData && (
          <div className="w-full max-w-sm bg-destructive/10 border border-destructive/30 rounded-2xl px-5 py-4 text-center" data-testid="status-error">
            <XCircle className="mx-auto text-destructive mb-2" size={32} />
            <div className="text-sm font-semibold text-foreground">
              {resultData.error === "Invalid PIN" ? "Incorrect PIN — try again" :
               resultData.error === "Already clocked in" ? `${resultData.employee?.name} is already clocked in` :
               resultData.error === "Not currently clocked in" ? `${resultData.employee?.name} isn't clocked in` :
               resultData.error}
            </div>
          </div>
        )}

        {/* PIN pad */}
        <div className="w-full max-w-sm">
          <div className="flex justify-center gap-4 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-150 ${pin.length > i ? "bg-primary scale-110" : "bg-border"}`}
                data-testid={`pin-dot-${i}`}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 justify-items-center mb-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button key={d} className="pin-btn" onClick={() => handlePinPress(String(d))} data-testid={`button-pin-${d}`} disabled={isPending}>{d}</button>
            ))}
            <div />
            <button className="pin-btn" onClick={() => handlePinPress("0")} data-testid="button-pin-0" disabled={isPending}>0</button>
            <button className="pin-btn" onClick={handleDelete} data-testid="button-pin-delete" disabled={isPending}><Delete size={22} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <button
              onClick={handleClockIn}
              disabled={pin.length < 4 || isPending}
              className="flex items-center justify-center gap-2 h-14 rounded-2xl font-semibold text-sm bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all"
              data-testid="button-clock-in"
            >
              <LogIn size={18} /> Clock In
            </button>
            <button
              onClick={handleClockOut}
              disabled={pin.length < 4 || isPending}
              className="flex items-center justify-center gap-2 h-14 rounded-2xl font-semibold text-sm bg-secondary border border-border text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted active:scale-95 transition-all"
              data-testid="button-clock-out"
            >
              <LogOut size={18} /> Clock Out
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">Enter your 4-digit PIN then tap Clock In or Clock Out</p>
        </div>
      </div>

      {/* ── My Hours PIN Modal ── */}
      <Dialog open={hoursStep === "pin"} onOpenChange={(open) => { if (!open) closeHours(); }}>
        <DialogContent className="bg-card border-border max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">My Hours</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">Enter your PIN to view your hours.</p>

          {/* Mini PIN dots */}
          <div className="flex justify-center gap-3 my-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${hoursPin.length > i ? "bg-primary scale-110" : "bg-border"}`} />
            ))}
          </div>
          {hoursPinError && (
            <p className="text-center text-xs text-destructive -mt-1">Incorrect PIN — try again</p>
          )}

          {/* Mini PIN pad */}
          <div className="grid grid-cols-3 gap-2 justify-items-center">
            {[1,2,3,4,5,6,7,8,9].map(d => (
              <button key={d} className="pin-btn !w-16 !h-16 !text-xl" onClick={() => handleHoursPinPress(String(d))}>{d}</button>
            ))}
            <div />
            <button className="pin-btn !w-16 !h-16 !text-xl" onClick={() => handleHoursPinPress("0")}>0</button>
            <button className="pin-btn !w-16 !h-16 !text-xl" onClick={handleHoursPinDelete}><Delete size={18} /></button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <button onClick={closeHours} className="flex items-center justify-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors">
              <X size={14} /> Cancel
            </button>
            <button
              onClick={verifyHoursPin}
              disabled={hoursPin.length < 4}
              className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="button-hours-pin-confirm"
            >
              <Check size={14} /> Confirm
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Shift Modal ── */}
      <Dialog open={editStep !== "idle"} onOpenChange={(open) => { if (!open) closeEditModal(); }}>
        <DialogContent className="bg-card border-border max-w-sm mx-auto">

          {/* Step 1: PIN verification */}
          {editStep === "pin" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground text-base">Edit Your Shift</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground -mt-2">Enter your PIN to access your most recent shift.</p>

              {/* Mini PIN dots */}
              <div className="flex justify-center gap-3 my-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${editPin.length > i ? "bg-primary scale-110" : "bg-border"}`} />
                ))}
              </div>
              {editPinError && (
                <p className="text-center text-xs text-destructive -mt-1">Incorrect PIN — try again</p>
              )}

              {/* Mini PIN pad */}
              <div className="grid grid-cols-3 gap-2 justify-items-center">
                {[1,2,3,4,5,6,7,8,9].map(d => (
                  <button key={d} className="pin-btn !w-16 !h-16 !text-xl" onClick={() => handleEditPinPress(String(d))}>{d}</button>
                ))}
                <div />
                <button className="pin-btn !w-16 !h-16 !text-xl" onClick={() => handleEditPinPress("0")}>0</button>
                <button className="pin-btn !w-16 !h-16 !text-xl" onClick={handleEditPinDelete}><Delete size={18} /></button>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-1">
                <button onClick={closeEditModal} className="flex items-center justify-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors">
                  <X size={14} /> Cancel
                </button>
                <button
                  onClick={verifyEditPin}
                  disabled={editPin.length < 4}
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  data-testid="button-edit-pin-confirm"
                >
                  <Check size={14} /> Confirm
                </button>
              </div>
            </>
          )}

          {/* Step 2: Edit times */}
          {editStep === "form" && editShift && (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground text-base">
                  Edit Shift — {editEmployee?.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Clock-In Time</label>
                  <input
                    type="datetime-local"
                    value={editClockIn}
                    onChange={e => setEditClockIn(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                    data-testid="input-self-edit-clock-in"
                  />
                </div>
                {editShift.clockOutTime && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Clock-Out Time</label>
                    <input
                      type="datetime-local"
                      value={editClockOut}
                      onChange={e => setEditClockOut(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                      data-testid="input-self-edit-clock-out"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Pay and overtime will be recalculated automatically.</p>
              </div>
              <DialogFooter className="flex gap-2">
                <button
                  onClick={closeEditModal}
                  className="flex-1 flex items-center justify-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                >
                  <X size={14} /> Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={!editClockIn || editShiftMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  data-testid="button-self-edit-save"
                >
                  <Check size={14} /> {editShiftMut.isPending ? "Saving..." : "Save"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
