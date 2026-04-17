import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Employee = {
  id: number;
  name: string;
  pin: string;
  role: string;
  hourlyRate: number;
  overtimeThreshold: number;
  overtimeMultiplier: number;
  weeklyOvertimeThreshold: number;
  isActive: boolean;
};

function EmployeeRow({ emp, onEdit }: { emp: Employee; onEdit: (e: Employee) => void }) {
  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3" data-testid={`card-employee-${emp.id}`}>
      <div>
        <div className="text-sm font-medium text-foreground">{emp.name}</div>
        <div className="flex gap-3 mt-1">
          <span className="text-xs text-muted-foreground">PIN: {emp.pin}</span>
          <span className="text-xs text-muted-foreground">£{emp.hourlyRate.toFixed(2)}/hr</span>
          <span className="text-xs text-muted-foreground">OT after {emp.overtimeThreshold}h</span>
          <span className="text-xs text-muted-foreground">×{emp.overtimeMultiplier}</span>
        </div>
      </div>
      <button
        onClick={() => onEdit(emp)}
        className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        data-testid={`button-edit-${emp.id}`}
      >
        <Pencil size={15} />
      </button>
    </div>
  );
}

type FormState = {
  name: string;
  pin: string;
  role: string;
  hourlyRate: string;
  overtimeThreshold: string;
  overtimeMultiplier: string;
  weeklyOvertimeThreshold: string;
};

const defaultForm: FormState = {
  name: "",
  pin: "",
  role: "employee",
  hourlyRate: "10.60",
  overtimeThreshold: "8",
  overtimeMultiplier: "1.5",
  weeklyOvertimeThreshold: "40",
};

export default function EmployeesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    queryFn: () => apiRequest("GET", "/api/employees").then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/employees", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees"] });
      qc.invalidateQueries({ queryKey: ["/api/status"] });
      toast({ title: "Employee added" });
      setAdding(false);
      setForm(defaultForm);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/employees/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees"] });
      qc.invalidateQueries({ queryKey: ["/api/status"] });
      toast({ title: "Employee updated" });
      setEditing(null);
    },
  });

  const startEdit = (emp: Employee) => {
    setEditing(emp);
    setAdding(false);
    setForm({
      name: emp.name,
      pin: emp.pin,
      role: emp.role,
      hourlyRate: String(emp.hourlyRate),
      overtimeThreshold: String(emp.overtimeThreshold),
      overtimeMultiplier: String(emp.overtimeMultiplier),
      weeklyOvertimeThreshold: String(emp.weeklyOvertimeThreshold),
    });
  };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setForm(defaultForm);
  };

  const handleSave = () => {
    const payload = {
      name: form.name,
      pin: form.pin,
      role: form.role,
      hourlyRate: parseFloat(form.hourlyRate),
      overtimeThreshold: parseFloat(form.overtimeThreshold),
      overtimeMultiplier: parseFloat(form.overtimeMultiplier),
      weeklyOvertimeThreshold: parseFloat(form.weeklyOvertimeThreshold),
      isActive: true,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const handleCancel = () => {
    setEditing(null);
    setAdding(false);
    setForm(defaultForm);
  };

  const f = (key: keyof FormState, value: string) => setForm(p => ({ ...p, [key]: value }));

  const showForm = adding || editing !== null;

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
            <div className="text-xs text-muted-foreground">Employees</div>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={startAdd}
            className="flex items-center gap-2 text-xs bg-primary text-primary-foreground px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
            data-testid="button-add-employee"
          >
            <Plus size={14} />
            Add Employee
          </button>
        )}
      </header>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
        {/* Employee form */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="form-employee">
            <h3 className="text-sm font-semibold text-foreground">{editing ? "Edit Employee" : "Add Employee"}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Full Name</label>
                <input
                  value={form.name}
                  onChange={e => f("name", e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  placeholder="e.g. James Smith"
                  data-testid="input-name"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">PIN (4 digits)</label>
                <input
                  value={form.pin}
                  onChange={e => f("pin", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  placeholder="e.g. 1234"
                  inputMode="numeric"
                  data-testid="input-pin"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                <select
                  value={form.role}
                  onChange={e => f("role", e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  data-testid="select-role"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Hourly Rate (£)</label>
                <input
                  value={form.hourlyRate}
                  onChange={e => f("hourlyRate", e.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  data-testid="input-hourly-rate"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Daily OT threshold (hrs)</label>
                <input
                  value={form.overtimeThreshold}
                  onChange={e => f("overtimeThreshold", e.target.value)}
                  type="number"
                  step="0.5"
                  min="0"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  data-testid="input-overtime-threshold"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">OT Multiplier</label>
                <input
                  value={form.overtimeMultiplier}
                  onChange={e => f("overtimeMultiplier", e.target.value)}
                  type="number"
                  step="0.25"
                  min="1"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  data-testid="input-overtime-multiplier"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Weekly OT threshold (hrs)</label>
                <input
                  value={form.weeklyOvertimeThreshold}
                  onChange={e => f("weeklyOvertimeThreshold", e.target.value)}
                  type="number"
                  step="1"
                  min="0"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                  data-testid="input-weekly-overtime"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={!form.name || form.pin.length !== 4 || createMut.isPending || updateMut.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                data-testid="button-save-employee"
              >
                <Check size={15} />
                Save
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                data-testid="button-cancel-employee"
              >
                <X size={15} />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Employee list */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {employees.map((emp: Employee) => (
              <EmployeeRow key={emp.id} emp={emp} onEdit={startEdit} />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pt-2">
          Overtime is calculated per shift based on the daily threshold. Weekly threshold is displayed for reference.
        </p>
      </div>
    </div>
  );
}
