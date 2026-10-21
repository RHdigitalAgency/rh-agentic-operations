/**
 * Business time zone. Form inputs (<input type="datetime-local">) carry no zone and the server runs in UTC, so every
 * wall-clock value — deadlines, "due today", "tomorrow at 09:00" — is interpreted and displayed in this zone.
 * Override with NEXT_PUBLIC_APP_TIMEZONE (an IANA name); inlined at build time so server and browser agree.
 */
const DEFAULT_TIME_ZONE = "America/Lima";

function validZone(tz: string | undefined): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export const APP_TIME_ZONE = validZone(process.env.NEXT_PUBLIC_APP_TIMEZONE) ?? DEFAULT_TIME_ZONE;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsIn(date: Date, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as Parts;
}

/** Milliseconds the zone is ahead of UTC at `date` (negative west of Greenwich). */
function offsetMs(date: Date, tz: string): number {
  const p = partsIn(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant at which the zone's wall clock shows the given time (DST-safe: re-checks the offset once). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, tz = APP_TIME_ZONE): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let t = wall - offsetMs(new Date(wall), tz);
  t = wall - offsetMs(new Date(t), tz);
  return new Date(t);
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Parses a zone-less "YYYY-MM-DDTHH:mm[:ss]" (datetime-local) as business-zone wall time; null if not that shape. */
export function parseLocalDateTime(s: string, tz = APP_TIME_ZONE): Date | null {
  const m = LOCAL_DATETIME.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m;
  return zonedTimeToUtc(+y, +mo, +d, +h, +mi, sec ? +sec : 0, tz);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Value for <input type="datetime-local"> showing `d` on the business-zone wall clock. */
export function toZonedInput(d: Date | string, tz = APP_TIME_ZONE): string {
  const p = partsIn(new Date(d), tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Calendar date (YYYY-MM-DD) of `at` in the business zone. */
export function zonedDay(at = new Date(), tz = APP_TIME_ZONE): string {
  const p = partsIn(at, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The instant `days` calendar days after `from` at hh:mm business time (e.g. tomorrow 09:00). */
export function zonedAt(days: number, hour: number, minute = 0, from = new Date(), tz = APP_TIME_ZONE): Date {
  const p = partsIn(from, tz);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hour, minute, 0, tz);
}

/** Last millisecond of the business day containing `at`. */
export function endOfZonedDay(at = new Date(), tz = APP_TIME_ZONE): Date {
  return new Date(zonedAt(1, 0, 0, at, tz).getTime() - 1);
}
