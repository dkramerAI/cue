import { describe, it, expect } from "vitest";
import { zonedDateTimeToUtc, getOffsetMinutes } from "@/lib/time";

describe("zonedDateTimeToUtc", () => {
  it("converts a New York wall-clock time (EDT) to the correct UTC instant", () => {
    const utc = zonedDateTimeToUtc("2024-06-15", "12:00", "America/New_York");
    expect(utc.toISOString()).toBe("2024-06-15T16:00:00.000Z"); // EDT = UTC-4
  });

  it("converts a winter New York time (EST) to UTC", () => {
    const utc = zonedDateTimeToUtc("2024-01-15", "12:00", "America/New_York");
    expect(utc.toISOString()).toBe("2024-01-15T17:00:00.000Z"); // EST = UTC-5
  });

  it("treats UTC input as already absolute", () => {
    const utc = zonedDateTimeToUtc("2024-06-15", "12:00", "UTC");
    expect(utc.toISOString()).toBe("2024-06-15T12:00:00.000Z");
  });
});

describe("getOffsetMinutes", () => {
  it("reports negative offsets for the Americas", () => {
    expect(getOffsetMinutes(new Date("2024-06-15T12:00:00Z"), "America/New_York")).toBe(-240);
  });

  it("reports positive offsets east of UTC", () => {
    expect(getOffsetMinutes(new Date("2024-06-15T12:00:00Z"), "Asia/Tokyo")).toBe(540);
  });
});
