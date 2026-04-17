import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertEmployeeSchema, insertShiftSchema } from "@shared/schema";
import { z } from "zod";

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function calculateHours(
  clockInTime: string,
  clockOutTime: string,
  dailyOvertimeThreshold: number,
  overtimeMultiplier: number,
  hourlyRate: number
) {
  const diffMs = new Date(clockOutTime).getTime() - new Date(clockInTime).getTime();
  const totalHours = diffMs / 3600000;

  const regularHours = Math.min(totalHours, dailyOvertimeThreshold);
  const overtimeHours = Math.max(0, totalHours - dailyOvertimeThreshold);
  const totalPay = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * overtimeMultiplier);

  return { totalHours, regularHours, overtimeHours, totalPay };
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // GET /api/employees — all active employees with status
  app.get("/api/employees", (req, res) => {
    try {
      const emps = storage.getEmployeesWithStatus();
      res.json(emps);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // GET /api/employees/:id
  app.get("/api/employees/:id", (req, res) => {
    const emp = storage.getEmployee(Number(req.params.id));
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    res.json(emp);
  });

  // POST /api/employees — create employee
  app.post("/api/employees", (req, res) => {
    try {
      const data = insertEmployeeSchema.parse(req.body);
      const emp = storage.createEmployee(data);
      res.status(201).json(emp);
    } catch (e) {
      res.status(400).json({ error: "Invalid data" });
    }
  });

  // PATCH /api/employees/:id — update employee
  app.patch("/api/employees/:id", (req, res) => {
    try {
      const emp = storage.updateEmployee(Number(req.params.id), req.body);
      if (!emp) return res.status(404).json({ error: "Not found" });
      res.json(emp);
    } catch (e) {
      res.status(400).json({ error: "Invalid data" });
    }
  });

  // POST /api/clock-in — clock in with PIN
  app.post("/api/clock-in", (req, res) => {
    try {
      const { pin } = z.object({ pin: z.string() }).parse(req.body);
      const employee = storage.getEmployeeByPin(pin);
      if (!employee) return res.status(401).json({ error: "Invalid PIN" });

      // Check if already clocked in
      const activeShift = storage.getActiveShift(employee.id);
      if (activeShift) {
        return res.status(409).json({ error: "Already clocked in", employee, shift: activeShift });
      }

      const now = new Date().toISOString();
      const today = now.split('T')[0];

      // Create clock event
      storage.createClockEvent({
        employeeId: employee.id,
        type: "in",
        timestamp: now,
      });

      // Create open shift
      const shift = storage.createShift({
        employeeId: employee.id,
        clockInTime: now,
        date: today,
      });

      res.json({ success: true, employee, shift });
    } catch (e) {
      res.status(400).json({ error: "Invalid request" });
    }
  });

  // POST /api/clock-out — clock out with PIN
  app.post("/api/clock-out", (req, res) => {
    try {
      const { pin } = z.object({ pin: z.string() }).parse(req.body);
      const employee = storage.getEmployeeByPin(pin);
      if (!employee) return res.status(401).json({ error: "Invalid PIN" });

      const activeShift = storage.getActiveShift(employee.id);
      if (!activeShift) {
        return res.status(409).json({ error: "Not currently clocked in", employee });
      }

      const now = new Date().toISOString();
      const { regularHours, overtimeHours, totalPay } = calculateHours(
        activeShift.clockInTime,
        now,
        employee.overtimeThreshold,
        employee.overtimeMultiplier,
        employee.hourlyRate
      );

      storage.createClockEvent({
        employeeId: employee.id,
        type: "out",
        timestamp: now,
      });

      const closedShift = storage.closeShift(activeShift.id, now, regularHours, overtimeHours, totalPay);

      res.json({ success: true, employee, shift: closedShift, regularHours, overtimeHours, totalPay });
    } catch (e) {
      res.status(400).json({ error: "Invalid request" });
    }
  });

  // GET /api/shifts — get shifts (query params: employeeId, startDate, endDate)
  app.get("/api/shifts", (req, res) => {
    try {
      const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const shifts = storage.getShifts(employeeId, startDate, endDate);
      res.json(shifts);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch shifts" });
    }
  });

  // PATCH /api/shifts/:id — edit clock-in/out times (manager)
  app.patch("/api/shifts/:id", (req, res) => {
    try {
      const { clockInTime, clockOutTime } = z.object({
        clockInTime: z.string(),
        clockOutTime: z.string().optional(),
      }).parse(req.body);

      const id = Number(req.params.id);
      // Get shift and employee to recalculate pay
      const allShifts = storage.getShifts();
      const shift = allShifts.find(s => s.id === id);
      if (!shift) return res.status(404).json({ error: "Shift not found" });

      const employee = storage.getEmployee(shift.employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found" });

      let updateData: any = { clockInTime };

      if (clockOutTime) {
        const { regularHours, overtimeHours, totalPay } = calculateHours(
          clockInTime,
          clockOutTime,
          employee.overtimeThreshold,
          employee.overtimeMultiplier,
          employee.hourlyRate
        );
        updateData = { clockInTime, clockOutTime, regularHours, overtimeHours, totalPay };
      }

      // Update date field based on new clock-in time
      updateData.date = new Date(clockInTime).toISOString().split('T')[0];

      const updated = storage.updateShift(id, updateData);
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: "Invalid data" });
    }
  });

  // DELETE /api/shifts/:id — delete a shift (manager)
  app.delete("/api/shifts/:id", (req, res) => {
    try {
      storage.deleteShift(Number(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete shift" });
    }
  });

  // GET /api/shifts/month — all shifts for a given month (YYYY-MM)
  app.get("/api/shifts/month", (req, res) => {
    try {
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const [year, mon] = month.split("-").map(Number);
      const startDate = `${month}-01`;
      const lastDay = new Date(year, mon, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
      const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
      const shifts = storage.getShifts(employeeId, startDate, endDate);
      res.json(shifts);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch monthly shifts" });
    }
  });

  // GET /api/summary — weekly summary for all employees
  app.get("/api/summary", (req, res) => {
    try {
      const weekStart = (req.query.weekStart as string) || getMonday(new Date());
      const employees = storage.getEmployees();

      const summary = employees.map(emp => {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        const shifts = storage.getShifts(emp.id, weekStart, weekEndStr);
        const totalHours = shifts.reduce((s, sh) => s + (sh.regularHours || 0) + (sh.overtimeHours || 0), 0);
        const totalPay = shifts.reduce((s, sh) => s + (sh.totalPay || 0), 0);
        const overtimeHours = shifts.reduce((s, sh) => s + (sh.overtimeHours || 0), 0);

        return {
          employee: emp,
          weekStart,
          totalHours,
          overtimeHours,
          totalPay,
          shifts: shifts.length,
        };
      });

      res.json(summary);
    } catch (e) {
      res.status(500).json({ error: "Failed to get summary" });
    }
  });

  // GET /api/status — current clock status for all employees
  app.get("/api/status", (req, res) => {
    try {
      const emps = storage.getEmployeesWithStatus();
      res.json(emps);
    } catch (e) {
      res.status(500).json({ error: "Failed to get status" });
    }
  });
}

