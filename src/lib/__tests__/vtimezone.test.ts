import { describe, it, expect } from "vitest";
import { buildVTimezone } from "@/lib/vtimezone";

describe("buildVTimezone", () => {
  it("returns nothing for UTC or an empty zone", () => {
    expect(buildVTimezone("UTC", 2024, 2024)).toEqual([]);
    expect(buildVTimezone("", 2024, 2024)).toEqual([]);
  });

  it("captures both US DST transitions with correct offsets", () => {
    const lines = buildVTimezone("America/New_York", 2024, 2024).join("\n");
    expect(lines).toContain("BEGIN:VTIMEZONE");
    expect(lines).toContain("TZID:America/New_York");

    // Spring forward: 2024-03-10 02:00 EST (-0500) -> EDT (-0400)
    expect(lines).toContain("BEGIN:DAYLIGHT");
    expect(lines).toContain("TZOFFSETFROM:-0500");
    expect(lines).toContain("TZOFFSETTO:-0400");
    expect(lines).toContain("DTSTART:20240310T020000");

    // Fall back: 2024-11-03 02:00 EDT (-0400) -> EST (-0500)
    expect(lines).toContain("BEGIN:STANDARD");
    expect(lines).toContain("TZOFFSETFROM:-0400");
    expect(lines).toContain("TZOFFSETTO:-0500");
    expect(lines).toContain("DTSTART:20241103T020000");
  });

  it("emits a single fixed STANDARD block for zones without DST", () => {
    const lines = buildVTimezone("Asia/Tokyo", 2024, 2024).join("\n");
    expect(lines).toContain("TZID:Asia/Tokyo");
    expect(lines).toContain("BEGIN:STANDARD");
    expect(lines).toContain("TZOFFSETFROM:+0900");
    expect(lines).toContain("TZOFFSETTO:+0900");
    expect(lines).not.toContain("BEGIN:DAYLIGHT");
  });

  it("handles southern-hemisphere DST (Sydney)", () => {
    const lines = buildVTimezone("Australia/Sydney", 2024, 2024).join("\n");
    expect(lines).toContain("BEGIN:DAYLIGHT");
    expect(lines).toContain("BEGIN:STANDARD");
    expect(lines).toContain("TZOFFSETTO:+1100"); // daylight
    expect(lines).toContain("TZOFFSETTO:+1000"); // standard
  });
});
