import { describe, it, expect } from "vitest";
import { generateICS } from "@/lib/ics";
import { parseICSContent } from "@/lib/ics-import";
import type { EventFormData } from "@/types/event";

function buildEvent(overrides: Partial<EventFormData> = {}): EventFormData {
  return {
    title: "Quarterly review",
    description: "Numbers and plans",
    location: "Room 4",
    url: "https://example.com/call",
    notes: "",
    organizer: "",
    organizerEmail: "",
    startDate: "2024-09-10",
    startTime: "14:30",
    endDate: "2024-09-10",
    endTime: "15:30",
    allDay: false,
    timezone: "America/Los_Angeles",
    reminders: [{ id: "x", minutes: 60 }],
    recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"] },
    exdates: [],
    ...overrides,
  };
}

describe("ICS round-trip (generate → import)", () => {
  it("preserves the core fields", () => {
    const parsed = parseICSContent(generateICS(buildEvent()));
    expect(parsed.events).toHaveLength(1);
    const event = parsed.events[0];
    expect(event.title).toBe("Quarterly review");
    expect(event.description).toBe("Numbers and plans");
    expect(event.location).toBe("Room 4");
    expect(event.startDate).toBe("2024-09-10");
    expect(event.startTime).toBe("14:30");
    expect(event.timezone).toBe("America/Los_Angeles");
  });

  it("preserves recurrence and reminders", () => {
    const parsed = parseICSContent(generateICS(buildEvent()));
    const event = parsed.events[0];
    expect(event.recurrence?.freq).toBe("WEEKLY");
    expect(event.recurrence?.byDay).toContain("TU");
    expect(event.reminders?.[0]?.minutes).toBe(60);
  });

  it("round-trips an all-day event back to the same date", () => {
    const parsed = parseICSContent(
      generateICS(buildEvent({ allDay: true, startDate: "2024-09-10", endDate: "2024-09-10" })),
    );
    const event = parsed.events[0];
    expect(event.allDay).toBe(true);
    expect(event.startDate).toBe("2024-09-10");
    expect(event.endDate).toBe("2024-09-10");
  });

  it("reports an error for non-calendar input", () => {
    const parsed = parseICSContent("not a calendar");
    expect(parsed.events).toHaveLength(0);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });
});
