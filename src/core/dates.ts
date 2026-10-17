// Calendar dates as "YYYY-MM-DD": fact `as_of` values, page fact lines and `search --since`.

export const DATE_RE: RegExp = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is "YYYY-MM-DD" and names a real UTC calendar date (no 2024-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const t = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC maps years 0-99 to 1900-1999; setUTCFullYear keeps them.
  if (y < 100) t.setUTCFullYear(y);
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
