import type { Express } from "express";
import type { Server } from "http";
import { storage, ready } from "./storage";
import { insertEmployeeSchema } from "@shared/schema";
import { z } from "zod";

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function calculateHours(clockInTime: string, clockOutTime: string, dailyOvertimeThreshold: number, overtimeMultiplier: number, hourlyRate: number) {
  const diffMs = new Date(clockOutTime).getTime() - new Date(clockInTime).getTime();
  const totalHours = diffMs / 3600000;
  const regularHours = Math.min(totalHours, dailyOvertimeThreshold);
  const overtimeHours = Math.max(0, totalHours - dailyOvertimeThreshold);
  const totalPay = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * overtimeMultiplier);
  return { totalHours, regularHours, overtimeHours, totalPay };
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // Wait for DB to be ready before accepting requests
  await ready;

  app.get("/api/employees", async (req, res) => {
    try { res.json(await storage.getEmployeesWithStatus()); }
    catch { res.status(500).json({ error: "Failed to fetch employees" }); }
  });

  app.get("/api/employees/:id", async (req, res) => {
    const emp = await storage.getEmployee(Number(req.params.id));
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    res.json(emp);
  });

  app.post("/api/employees", async (req, res) => {
    try {
      const data = insertEmployeeSchema.parse(req.body);
      res.status(201).json(await storage.createEmployee(data));
    } catch { res.status(400).json({ error: "Invalid data" }); }
  });

  app.patch("/api/employees/:id", async (req, res) => {
    try {
      const emp = await storage.updateEmployee(Number(req.params.id), req.body);
      if (!emp) return res.status(404).json({ error: "Not found" });
      res.json(emp);
    } catch { res.status(400).json({ error: "Invalid data" }); }
  });

  app.post("/api/clock-in", async (req, res) => {
    try {
      const { pin } = z.object({ pin: z.string() }).parse(req.body);
      const employee = await storage.getEmployeeByPin(pin);
      if (!employee) return res.status(401).json({ error: "Invalid PIN" });

      const activeShift = await storage.getActiveShift(employee.id);
      if (activeShift) return res.status(409).json({ error: "Already clocked in", employee, shift: activeShift });

      const now = new Date().toISOString();
      await storage.createClockEvent({ employeeId: employee.id, type: "in", timestamp: now });
      const shift = await storage.createShift({ employeeId: employee.id, clockInTime: now, date: now.split('T')[0] });
      res.json({ success: true, employee, shift });
    } catch { res.status(400).json({ error: "Invalid request" }); }
  });

  app.post("/api/clock-out", async (req, res) => {
    try {
      const { pin } = z.object({ pin: z.string() }).parse(req.body);
      const employee = await storage.getEmployeeByPin(pin);
      if (!employee) return res.status(401).json({ error: "Invalid PIN" });

      const activeShift = await storage.getActiveShift(employee.id);
      if (!activeShift) return res.status(409).json({ error: "Not currently clocked in", employee });

      const now = new Date().toISOString();
      const { regularHours, overtimeHours, totalPay } = calculateHours(
        activeShift.clockInTime, now, employee.overtimeThreshold, employee.overtimeMultiplier, employee.hourlyRate
      );
      await storage.createClockEvent({ employeeId: employee.id, type: "out", timestamp: now });
      const closedShift = await storage.closeShift(activeShift.id, now, regularHours, overtimeHours, totalPay);
      res.json({ success: true, employee, shift: closedShift, regularHours, overtimeHours, totalPay });
    } catch { res.status(400).json({ error: "Invalid request" }); }
  });

  app.get("/api/shifts/month", async (req, res) => {
    try {
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const [year, mon] = month.split("-").map(Number);
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;
      const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
      res.json(await storage.getShifts(employeeId, startDate, endDate));
    } catch { res.status(500).json({ error: "Failed to fetch monthly shifts" }); }
  });

  app.get("/api/shifts", async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      res.json(await storage.getShifts(employeeId, startDate, endDate));
    } catch { res.status(500).json({ error: "Failed to fetch shifts" }); }
  });

  app.patch("/api/shifts/:id", async (req, res) => {
    try {
      const { clockInTime, clockOutTime } = z.object({
        clockInTime: z.string(),
        clockOutTime: z.string().optional(),
      }).parse(req.body);

      const id = Number(req.params.id);
      const allShifts = await storage.getShifts();
      const shift = allShifts.find(s => s.id === id);
      if (!shift) return res.status(404).json({ error: "Shift not found" });

      const employee = await storage.getEmployee(shift.employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found" });

      let updateData: any = { clockInTime, date: new Date(clockInTime).toISOString().split('T')[0] };
      if (clockOutTime) {
        const { regularHours, overtimeHours, totalPay } = calculateHours(
          clockInTime, clockOutTime, employee.overtimeThreshold, employee.overtimeMultiplier, employee.hourlyRate
        );
        updateData = { ...updateData, clockOutTime, regularHours, overtimeHours, totalPay };
      }
      res.json(await storage.updateShift(id, updateData));
    } catch { res.status(400).json({ error: "Invalid data" }); }
  });

  app.delete("/api/shifts/:id", async (req, res) => {
    try {
      await storage.deleteShift(Number(req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete shift" }); }
  });

  app.get("/api/summary", async (req, res) => {
    try {
      const weekStart = (req.query.weekStart as string) || getMonday(new Date());
      const employees = await storage.getEmployees();
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      const summary = await Promise.all(employees.map(async emp => {
        const shifts = await storage.getShifts(emp.id, weekStart, weekEndStr);
        return {
          employee: emp,
          weekStart,
          totalHours: shifts.reduce((s, sh) => s + (sh.regularHours || 0) + (sh.overtimeHours || 0), 0),
          overtimeHours: shifts.reduce((s, sh) => s + (sh.overtimeHours || 0), 0),
          totalPay: shifts.reduce((s, sh) => s + (sh.totalPay || 0), 0),
          shifts: shifts.length,
        };
      }));
      res.json(summary);
    } catch { res.status(500).json({ error: "Failed to get summary" }); }
  });

  app.get("/api/status", async (req, res) => {
    try { res.json(await storage.getEmployeesWithStatus()); }
    catch { res.status(500).json({ error: "Failed to get status" }); }
  });
}
