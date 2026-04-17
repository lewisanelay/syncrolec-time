import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Employees table
export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pin: text("pin").notNull(), // 4-digit PIN for clock in/out
  role: text("role").notNull().default("employee"), // "employee" | "manager"
  hourlyRate: real("hourly_rate").notNull().default(10.60),
  overtimeThreshold: real("overtime_threshold").notNull().default(8), // hours/day before overtime
  overtimeMultiplier: real("overtime_multiplier").notNull().default(1.5),
  weeklyOvertimeThreshold: real("weekly_overtime_threshold").notNull().default(40), // hours/week
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// Clock events table — each individual clock in or out
export const clockEvents = sqliteTable("clock_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  type: text("type").notNull(), // "in" | "out"
  timestamp: text("timestamp").notNull(), // ISO string
  note: text("note"), // optional note
});

// Shifts table — a completed shift (pair of clock in + clock out)
export const shifts = sqliteTable("shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  clockInTime: text("clock_in_time").notNull(), // ISO string
  clockOutTime: text("clock_out_time"), // null if still clocked in
  regularHours: real("regular_hours"),
  overtimeHours: real("overtime_hours"),
  totalPay: real("total_pay"),
  date: text("date").notNull(), // YYYY-MM-DD
  note: text("note"),
});

// Insert schemas
export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true });
export const insertClockEventSchema = createInsertSchema(clockEvents).omit({ id: true });
export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true });

// Insert types
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type InsertClockEvent = z.infer<typeof insertClockEventSchema>;
export type InsertShift = z.infer<typeof insertShiftSchema>;

// Select types
export type Employee = typeof employees.$inferSelect;
export type ClockEvent = typeof clockEvents.$inferSelect;
export type Shift = typeof shifts.$inferSelect;

// Extended types for frontend use
export type ShiftWithEmployee = Shift & { employee: Employee };
export type EmployeeWithStatus = Employee & {
  currentlyClocked: boolean;
  lastClockIn?: string;
  todayHours?: number;
};
