/**
 * localBackup.ts
 * Automatically saves shift data to localStorage whenever it changes.
 * Acts as a safety net if the server session resets.
 */

const BACKUP_KEY = "syncrolec_backup";

export type BackupShift = {
  id: number;
  employeeId: number;
  employeeName: string;
  clockInTime: string;
  clockOutTime: string | null;
  regularHours: number | null;
  overtimeHours: number | null;
  totalPay: number | null;
};

export type LocalBackup = {
  savedAt: string; // ISO timestamp
  shifts: BackupShift[];
};

/** Save a full snapshot of shifts to localStorage */
export function saveBackup(shifts: BackupShift[]) {
  try {
    const backup: LocalBackup = {
      savedAt: new Date().toISOString(),
      shifts,
    };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  } catch {
    // localStorage may be unavailable in some private browsing modes — fail silently
  }
}

/** Load the most recent backup from localStorage, or null if none */
export function loadBackup(): LocalBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalBackup;
  } catch {
    return null;
  }
}

/** Clear the backup */
export function clearBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {}
}

/** Format a saved-at timestamp nicely */
export function formatBackupDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
