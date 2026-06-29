import { describe, it, expect } from "vitest";
import { generateICS } from "@/lib/ics";
import type { EventFormData } from "@/types/event";

function buildEvent(overrides: Partial<EventFormData> = {}): EventFormData {
  return {
    title: "Team sync",
    description: "",
    location: "",
    url: "",
    notes: "",
    organizer: "",
    organizerEmail: "",
    startDate: "2024-06-15",
    startTime: "10:00",
    endDate: "2024-06-15",
    endTime: "11:00",
    allDay: false,
    timezone: "America/New_York",
    reminders: [],
    recurrence: { freq: "", interval: 1, byDay: [] },
    exdates: [],
    ...overrides,
  };
}

describe("generateICS — time zone forms", () => {
  it("emits a TZID property and an accompanying VTIMEZONE for IANA zones", () => {
    const ics = generateICS(buildEvent({ timezone: "America/New_York" }));
    expect(ics).toContain("DTSTART;TZID=America/New_York:20240615T100000\r\n");
    expect(ics).toContain("DTEND;TZID=America/New_York:20240615T110000\r\n");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:America/New_York");
  });

  it("emits a floating time (no Z, no TZID) when the zone is empty", () => {
    const ics = generateICS(buildEvent({ timezone: "" }));
    expect(ics).toContain("DTSTART:20240615T100000\r\n");
    expect(ics).not.toContain("DTSTART:20240615T100000Z");
    expect(ics).not.toContain("TZID=:"); // the old malformed form
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
  });

  it("emits an absolute Z time for UTC without shifting by the host offset", () => {
    const ics = generateICS(buildEvent({ timezone: "UTC" }));
    expect(ics).toContain("DTSTART:20240615T100000Z\r\n");
    expect(ics).toContain("DTEND:20240615T110000Z\r\n");
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
  });
});

describe("generateICS — event content", () => {
  it("makes all-day DTEND exclusive (one day past the final date)", () => {
    const ics = generateICS(buildEvent({ allDay: true, startDate: "2024-06-15", endDate: "2024-06-15" }));
    expect(ics).toContain("DTSTART;VALUE=DATE:20240615\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20240616\r\n");
  });

  it("escapes special characters in text fields", () => {
    const ics = generateICS(buildEvent({ title: "A, B; C\nD" }));
    expect(ics).toContain("SUMMARY:A\\, B\\; C\\nD");
  });

  it("builds an RRULE from recurrence", () => {
    const ics = generateICS(
      buildEvent({ recurrence: { freq: "WEEKLY", interval: 2, byDay: ["MO", "WE"] } }),
    );
    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
  });

  it("builds VALARM blocks from reminders", () => {
    const ics = generateICS(buildEvent({ reminders: [{ id: "a", minutes: 60 }] }));
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT60M");
  });

  it("uses PT0S for an at-time alert", () => {
    const ics = generateICS(buildEvent({ reminders: [{ id: "a", minutes: 0 }] }));
    expect(ics).toContain("TRIGGER:PT0S");
  });

  it("wraps multiple events in a single VCALENDAR", () => {
    const ics = generateICS([buildEvent({ title: "One" }), buildEvent({ title: "Two" })]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
  });

  it("shares one VTIMEZONE across events in the same zone", () => {
    const ics = generateICS([buildEvent({ title: "One" }), buildEvent({ title: "Two" })]);
    expect(ics.match(/BEGIN:VTIMEZONE/g)).toHaveLength(1);
  });

  it("produces CRLF line endings and is well-formed", () => {
    const ics = generateICS(buildEvent());
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
