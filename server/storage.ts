import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, gte, lte, isNull } from "drizzle-orm";
import {
  employees, clockEvents, shifts,
  type Employee, type ClockEvent, type Shift,
  type InsertEmployee, type InsertClockEvent, type InsertShift,
  type EmployeeWithStatus, type ShiftWithEmployee,
} from "@shared/schema";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

// Create tables
sqlite.exec(`
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

// Seed default data if empty
const empCount = db.select().from(employees).all();
if (empCount.length === 0) {
  db.insert(employees).values([
    {
      name: "Mark (Manager)",
      pin: "1234",
      role: "manager",
      hourlyRate: 20.00,
      overtimeThreshold: 8,
      overtimeMultiplier: 1.5,
      weeklyOvertimeThreshold: 40,
      isActive: true,
    },
    {
      name: "Lewis",
      pin: "5678",
      role: "employee",
      hourlyRate: 10.60,
      overtimeThreshold: 8,
      overtimeMultiplier: 1.5,
      weeklyOvertimeThreshold: 40,
      isActive: true,
    },
  ]).run();
}

export interface IStorage {
  // Employees
  getEmployees(): Employee[];
  getEmployee(id: number): Employee | undefined;
  getEmployeeByPin(pin: string): Employee | undefined;
  createEmployee(data: InsertEmployee): Employee;
  updateEmployee(id: number, data: Partial<InsertEmployee>): Employee | undefined;

  // Shifts
  getShifts(employeeId?: number, startDate?: string, endDate?: string): ShiftWithEmployee[];
  getActiveShift(employeeId: number): Shift | undefined;
  createShift(data: InsertShift): Shift;
  closeShift(id: number, clockOutTime: string, regularHours: number, overtimeHours: number, totalPay: number): Shift | undefined;
  updateShift(id: number, data: Partial<InsertShift>): Shift | undefined;
  deleteShift(id: number): void;

  // Clock events
  getClockEvents(employeeId?: number): ClockEvent[];
  createClockEvent(data: InsertClockEvent): ClockEvent;

  // Dashboard
  getEmployeesWithStatus(): EmployeeWithStatus[];
  getWeeklyHours(employeeId: number, weekStart: string): number;
}

export const storage: IStorage = {
  getEmployees() {
    return db.select().from(employees).where(eq(employees.isActive, true)).all();
  },

  getEmployee(id) {
    return db.select().from(employees).where(eq(employees.id, id)).get();
  },

  getEmployeeByPin(pin) {
    return db.select().from(employees)
      .where(and(eq(employees.pin, pin), eq(employees.isActive, true)))
      .get();
  },

  createEmployee(data) {
    return db.insert(employees).values(data).returning().get();
  },

  updateEmployee(id, data) {
    return db.update(employees).set(data).where(eq(employees.id, id)).returning().get();
  },

  getShifts(employeeId, startDate, endDate) {
    const allEmployees = db.select().from(employees).all();
    let query = db.select().from(shifts);
    let results: Shift[];

    if (employeeId && startDate && endDate) {
      results = db.select().from(shifts)
        .where(and(eq(shifts.employeeId, employeeId), gte(shifts.date, startDate), lte(shifts.date, endDate)))
        .orderBy(desc(shifts.clockInTime))
        .all();
    } else if (employeeId) {
      results = db.select().from(shifts)
        .where(eq(shifts.employeeId, employeeId))
        .orderBy(desc(shifts.clockInTime))
        .all();
    } else if (startDate && endDate) {
      results = db.select().from(shifts)
        .where(and(gte(shifts.date, startDate), lte(shifts.date, endDate)))
        .orderBy(desc(shifts.clockInTime))
        .all();
    } else {
      results = db.select().from(shifts).orderBy(desc(shifts.clockInTime)).all();
    }

    return results.map(shift => ({
      ...shift,
      employee: allEmployees.find(e => e.id === shift.employeeId)!,
    }));
  },

  getActiveShift(employeeId) {
    return sqlite.prepare('SELECT * FROM shifts WHERE employee_id = ? AND clock_out_time IS NULL').get(employeeId) as any;
  },

  createShift(data) {
    return db.insert(shifts).values(data).returning().get();
  },

  closeShift(id, clockOutTime, regularHours, overtimeHours, totalPay) {
    return db.update(shifts)
      .set({ clockOutTime, regularHours, overtimeHours, totalPay })
      .where(eq(shifts.id, id))
      .returning()
      .get();
  },

  updateShift(id, data) {
    return db.update(shifts).set(data).where(eq(shifts.id, id)).returning().get();
  },

  deleteShift(id) {
    db.delete(shifts).where(eq(shifts.id, id)).run();
  },

  getClockEvents(employeeId) {
    if (employeeId) {
      return db.select().from(clockEvents).where(eq(clockEvents.employeeId, employeeId)).orderBy(desc(clockEvents.timestamp)).all();
    }
    return db.select().from(clockEvents).orderBy(desc(clockEvents.timestamp)).all();
  },

  createClockEvent(data) {
    return db.insert(clockEvents).values(data).returning().get();
  },

  getEmployeesWithStatus() {
    const allEmployees = db.select().from(employees).where(eq(employees.isActive, true)).all();
    const today = new Date().toISOString().split('T')[0];

    return allEmployees.map(emp => {
      const activeShift = sqlite.prepare('SELECT * FROM shifts WHERE employee_id = ? AND clock_out_time IS NULL').get(emp.id) as any;

      const todayShifts = db.select().from(shifts)
        .where(and(eq(shifts.employeeId, emp.id), eq(shifts.date, today)))
        .all();

      const todayHours = todayShifts.reduce((sum, s) => {
        if (s.clockOutTime) {
          return sum + (s.regularHours || 0) + (s.overtimeHours || 0);
        }
        // Currently clocked in — add elapsed time
        const elapsed = (Date.now() - new Date(s.clockInTime).getTime()) / 3600000;
        return sum + elapsed;
      }, 0);

      return {
        ...emp,
        currentlyClocked: !!activeShift,
        lastClockIn: activeShift?.clock_in_time ?? activeShift?.clockInTime,
        todayHours,
      };
    });
  },

  getWeeklyHours(employeeId, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const weekShifts = db.select().from(shifts)
      .where(and(
        eq(shifts.employeeId, employeeId),
        gte(shifts.date, weekStart),
        lte(shifts.date, weekEndStr)
      ))
      .all();

    return weekShifts.reduce((sum, s) => sum + (s.regularHours || 0) + (s.overtimeHours || 0), 0);
  },
};
