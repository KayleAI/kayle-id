const TERMINAL_SESSION_STATUSES = new Set([
  "expired",
  "cancelled",
  "completed",
]);
const TERMINAL_ATTEMPT_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

export function isTerminalSessionStatus(status: string): boolean {
  return TERMINAL_SESSION_STATUSES.has(status);
}

export function isTerminalAttemptStatus(status: string): boolean {
  return TERMINAL_ATTEMPT_STATUSES.has(status);
}
