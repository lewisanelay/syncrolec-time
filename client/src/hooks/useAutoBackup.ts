/**
 * useAutoBackup
 * Fetches all shifts from the server and saves them to localStorage.
 * Call triggerBackup() after any clock-in, clock-out, or shift edit.
 */

import { useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { saveBackup, type BackupShift } from "@/lib/localBackup";

export function useAutoBackup() {
  const triggerBackup = useCallback(async () => {
    try {
      // Fetch all shifts (no date filter = everything)
      const shifts = await apiRequest("GET", "/api/shifts").then((r) => r.json());
      if (!Array.isArray(shifts)) return;

      const mapped: BackupShift[] = shifts.map((s: any) => ({
        id: s.id,
        employeeId: s.employeeId,
        employeeName: s.employee?.name ?? "Unknown",
        clockInTime: s.clockInTime,
        clockOutTime: s.clockOutTime ?? null,
        regularHours: s.regularHours ?? null,
        overtimeHours: s.overtimeHours ?? null,
        totalPay: s.totalPay ?? null,
      }));

      saveBackup(mapped);
    } catch {
      // Fail silently — backup is best-effort
    }
  }, []);

  return { triggerBackup };
}
