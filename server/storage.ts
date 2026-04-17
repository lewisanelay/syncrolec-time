import { createClient } from "@libsql/client";
import {
  type Employee, type ClockEvent, type Shift,
  type InsertEmployee, type InsertClockEvent, type InsertShift,
  type EmployeeWithStatus, type ShiftWithEmployee,
} from "@shared/schema";

const db = createClient({ url: "file:sqlite.db" });

// ── Bootstrap tables ──────────────────────────────────────────────────────────
async function init() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      hourly_rate REAL NOT NULL DEFAULT 10.60,
      overtime_threshold REAL NOT NULL DEFAULT 8,
      overtime_multiplier REAL NOT NULL DEFAULT 1.5,
      weekly_overtime_threshold REAL NOT NULL DEFAULT 40,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS clock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      clock_in_time TEXT NOT NULL,
      clock_out_time TEXT,
      regular_hours REAL,
      overtime_hours REAL,
      total_pay REAL,
      date TEXT NOT NULL,
      note TEXT
    );
  `);

  // Seed default employees if none exist
  const { rows } = await db.execute("SELECT COUNT(*) as cnt FROM employees");
  if ((rows[0] as any).cnt === 0) {
    await db.executeMultiple(`
      INSERT INTO employees (name, pin, role, hourly_rate, overtime_threshold, overtime_multiplier, weekly_overtime_threshold, is_active)
      VALUES ('Mark (Manager)', '1234', 'manager', 20.00, 8, 1.5, 40, 1);
      INSERT INTO employees (name, pin, role, hourly_rate, overtime_threshold, overtime_multiplier, weekly_overtime_threshold, is_active)
      VALUES ('Lewis', '5678', 'employee', 10.60, 8, 1.5, 40, 1);
    `);
  }
}

// Run init synchronously-ish by storing the promise; routes await it
export const ready = init();

// ── Helpers ───────────────────────────────────────────────────────────────────
function rowToEmployee(r: any): Employee {
  return {
    id: r.id,
    name: r.name,
    pin: r.pin,
    role: r.role,
    hourlyRate: r.hourly_rate,
    overtimeThreshold: r.overtime_threshold,
    overtimeMultiplier: r.overtime_multiplier,
    weeklyOvertimeThreshold: r.weekly_overtime_threshold,
    isActive: r.is_active === 1,
  };
}

function rowToShift(r: any): Shift {
  return {
    id: r.id,
    employeeId: r.employee_id,
    clockInTime: r.clock_in_time,
    clockOutTime: r.clock_out_time ?? null,
    regularHours: r.regular_hours ?? null,
    overtimeHours: r.overtime_hours ?? null,
    totalPay: r.total_pay ?? null,
    date: r.date,
    note: r.note ?? null,
  };
}

// ── Interface ─────────────────────────────────────────────────────────────────
export interface IStorage {
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  getEmployeeByPin(pin: string): Promise<Employee | undefined>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee | undefined>;

  getShifts(employeeId?: number, startDate?: string, endDate?: string): Promise<ShiftWithEmployee[]>;
  getActiveShift(employeeId: number): Promise<Shift | undefined>;
  createShift(data: InsertShift): Promise<Shift>;
  closeShift(id: number, clockOutTime: string, regularHours: number, overtimeHours: number, totalPay: number): Promise<Shift | undefined>;
  updateShift(id: number, data: Partial<InsertShift>): Promise<Shift | undefined>;
  deleteShift(id: number): Promise<void>;

  getClockEvents(employeeId?: number): Promise<ClockEvent[]>;
  createClockEvent(data: InsertClockEvent): Promise<ClockEvent>;

  getEmployeesWithStatus(): Promise<EmployeeWithStatus[]>;
  getWeeklyHours(employeeId: number, weekStart: string): Promise<number>;
}

export const storage: IStorage = {
  async getEmployees() {
    const { rows } = await db.execute("SELECT * FROM employees WHERE is_active = 1");
    return rows.map(rowToEmployee);
  },

  async getEmployee(id) {
    const { rows } = await db.execute({ sql: "SELECT * FROM employees WHERE id = ?", args: [id] });
    return rows[0] ? rowToEmployee(rows[0]) : undefined;
  },

  async getEmployeeByPin(pin) {
    const { rows } = await db.execute({ sql: "SELECT * FROM employees WHERE pin = ? AND is_active = 1", args: [pin] });
    return rows[0] ? rowToEmployee(rows[0]) : undefined;
  },

  async createEmployee(data) {
    const { lastInsertRowid } = await db.execute({
      sql: `INSERT INTO employees (name, pin, role, hourly_rate, overtime_threshold, overtime_multiplier, weekly_overtime_threshold, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [data.name, data.pin, data.role ?? "employee", data.hourlyRate ?? 10.60,
             data.overtimeThreshold ?? 8, data.overtimeMultiplier ?? 1.5,
             data.weeklyOvertimeThreshold ?? 40, data.isActive === false ? 0 : 1],
    });
    return (await this.getEmployee(Number(lastInsertRowid)))!;
  },

  async updateEmployee(id, data) {
    const fields: string[] = [];
    const args: any[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); args.push(data.name); }
    if (data.pin !== undefined) { fields.push("pin = ?"); args.push(data.pin); }
    if (data.role !== undefined) { fields.push("role = ?"); args.push(data.role); }
    if (data.hourlyRate !== undefined) { fields.push("hourly_rate = ?"); args.push(data.hourlyRate); }
    if (data.overtimeThreshold !== undefined) { fields.push("overtime_threshold = ?"); args.push(data.overtimeThreshold); }
    if (data.overtimeMultiplier !== undefined) { fields.push("overtime_multiplier = ?"); args.push(data.overtimeMultiplier); }
    if (data.weeklyOvertimeThreshold !== undefined) { fields.push("weekly_overtime_threshold = ?"); args.push(data.weeklyOvertimeThreshold); }
    if (data.isActive !== undefined) { fields.push("is_active = ?"); args.push(data.isActive ? 1 : 0); }
    if (fields.length === 0) return this.getEmployee(id);
    args.push(id);
    await db.execute({ sql: `UPDATE employees SET ${fields.join(", ")} WHERE id = ?`, args });
    return this.getEmployee(id);
  },

  async getShifts(employeeId, startDate, endDate) {
    let sql = "SELECT * FROM shifts WHERE 1=1";
    const args: any[] = [];
    if (employeeId) { sql += " AND employee_id = ?"; args.push(employeeId); }
    if (startDate) { sql += " AND date >= ?"; args.push(startDate); }
    if (endDate) { sql += " AND date <= ?"; args.push(endDate); }
    sql += " ORDER BY clock_in_time DESC";
    const { rows: shiftRows } = await db.execute({ sql, args });
    const { rows: empRows } = await db.execute("SELECT * FROM employees");
    const emps = empRows.map(rowToEmployee);
    return shiftRows.map(r => ({
      ...rowToShift(r),
      employee: emps.find(e => e.id === (r as any).employee_id)!,
    }));
  },

  async getActiveShift(employeeId) {
    const { rows } = await db.execute({
      sql: "SELECT * FROM shifts WHERE employee_id = ? AND clock_out_time IS NULL LIMIT 1",
      args: [employeeId],
    });
    return rows[0] ? rowToShift(rows[0]) : undefined;
  },

  async createShift(data) {
    const { lastInsertRowid } = await db.execute({
      sql: "INSERT INTO shifts (employee_id, clock_in_time, date) VALUES (?, ?, ?)",
      args: [data.employeeId, data.clockInTime, data.date],
    });
    const { rows } = await db.execute({ sql: "SELECT * FROM shifts WHERE id = ?", args: [Number(lastInsertRowid)] });
    return rowToShift(rows[0]);
  },

  async closeShift(id, clockOutTime, regularHours, overtimeHours, totalPay) {
    await db.execute({
      sql: "UPDATE shifts SET clock_out_time = ?, regular_hours = ?, overtime_hours = ?, total_pay = ? WHERE id = ?",
      args: [clockOutTime, regularHours, overtimeHours, totalPay, id],
    });
    const { rows } = await db.execute({ sql: "SELECT * FROM shifts WHERE id = ?", args: [id] });
    return rows[0] ? rowToShift(rows[0]) : undefined;
  },

  async updateShift(id, data) {
    const fields: string[] = [];
    const args: any[] = [];
    if (data.clockInTime !== undefined) { fields.push("clock_in_time = ?"); args.push(data.clockInTime); }
    if (data.clockOutTime !== undefined) { fields.push("clock_out_time = ?"); args.push(data.clockOutTime); }
    if (data.regularHours !== undefined) { fields.push("regular_hours = ?"); args.push(data.regularHours); }
    if (data.overtimeHours !== undefined) { fields.push("overtime_hours = ?"); args.push(data.overtimeHours); }
    if (data.totalPay !== undefined) { fields.push("total_pay = ?"); args.push(data.totalPay); }
    if (fields.length === 0) return undefined;
    args.push(id);
    await db.execute({ sql: `UPDATE shifts SET ${fields.join(", ")} WHERE id = ?`, args });
    const { rows } = await db.execute({ sql: "SELECT * FROM shifts WHERE id = ?", args: [id] });
    return rows[0] ? rowToShift(rows[0]) : undefined;
  },

  async deleteShift(id) {
    await db.execute({ sql: "DELETE FROM shifts WHERE id = ?", args: [id] });
  },

  async getClockEvents(employeeId) {
    if (employeeId) {
      const { rows } = await db.execute({ sql: "SELECT * FROM clock_events WHERE employee_id = ? ORDER BY timestamp DESC", args: [employeeId] });
      return rows.map((r: any) => ({ id: r.id, employeeId: r.employee_id, type: r.type, timestamp: r.timestamp, note: r.note }));
    }
    const { rows } = await db.execute("SELECT * FROM clock_events ORDER BY timestamp DESC");
    return rows.map((r: any) => ({ id: r.id, employeeId: r.employee_id, type: r.type, timestamp: r.timestamp, note: r.note }));
  },

  async createClockEvent(data) {
    const { lastInsertRowid } = await db.execute({
      sql: "INSERT INTO clock_events (employee_id, type, timestamp, note) VALUES (?, ?, ?, ?)",
      args: [data.employeeId, data.type, data.timestamp, data.note ?? null],
    });
    return { id: Number(lastInsertRowid), employeeId: data.employeeId, type: data.type, timestamp: data.timestamp, note: data.note ?? null };
  },

  async getEmployeesWithStatus() {
    const emps = await this.getEmployees();
    const today = new Date().toISOString().split("T")[0];
    return Promise.all(emps.map(async emp => {
      const activeShift = await this.getActiveShift(emp.id);
      const { rows } = await db.execute({
        sql: "SELECT * FROM shifts WHERE employee_id = ? AND date = ?",
        args: [emp.id, today],
      });
      const todayHours = rows.reduce((sum, s: any) => {
        if (s.clock_out_time) return sum + (s.regular_hours || 0) + (s.overtime_hours || 0);
        return sum + (Date.now() - new Date(s.clock_in_time).getTime()) / 3600000;
      }, 0);
      return { ...emp, currentlyClocked: !!activeShift, lastClockIn: activeShift?.clockInTime, todayHours };
    }));
  },

  async getWeeklyHours(employeeId, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const { rows } = await db.execute({
      sql: "SELECT * FROM shifts WHERE employee_id = ? AND date >= ? AND date <= ?",
      args: [employeeId, weekStart, weekEnd.toISOString().split("T")[0]],
    });
    return rows.reduce((sum, s: any) => sum + (s.regular_hours || 0) + (s.overtime_hours || 0), 0);
  },
};
