import { describe, expect, it } from "vitest";
import { endOfZonedDay, parseLocalDateTime, toZonedInput, zonedAt, zonedDay } from "@/lib/time";

describe("business time zone helpers", () => {
  it("interprets form wall-clock times in the business zone, not the server's UTC", () => {
    expect(parseLocalDateTime("2026-10-22T09:00", "America/Lima")!.toISOString()).toBe("2026-10-22T14:00:00.000Z");
    expect(parseLocalDateTime("2026-10-22T09:00", "UTC")!.toISOString()).toBe("2026-10-22T09:00:00.000Z");
    expect(parseLocalDateTime("2026-10-22T09:00:00Z")).toBeNull(); // has a zone: not a wall-clock value
  });

  it("handles daylight-saving zones on both sides of the change", () => {
    expect(parseLocalDateTime("2026-07-01T09:00", "America/New_York")!.toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(parseLocalDateTime("2026-12-01T09:00", "America/New_York")!.toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("round-trips through the datetime-local input format", () => {
    const d = parseLocalDateTime("2026-10-22T09:30", "America/Lima")!;
    expect(toZonedInput(d, "America/Lima")).toBe("2026-10-22T09:30");
  });

  it("computes business days: today, tomorrow at 09:00, end of day", () => {
    const lateEvening = new Date("2026-10-22T03:00:00Z"); // 22:00 on Oct 21 in Lima
    expect(zonedDay(lateEvening, "America/Lima")).toBe("2026-10-21");
    expect(zonedAt(1, 9, 0, lateEvening, "America/Lima").toISOString()).toBe("2026-10-22T14:00:00.000Z");
    expect(endOfZonedDay(lateEvening, "America/Lima").toISOString()).toBe("2026-10-22T04:59:59.999Z");
  });
});
