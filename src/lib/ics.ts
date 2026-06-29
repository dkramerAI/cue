import { EventFormData } from "@/types/event";
import { BRAND, ORGANIZER_FALLBACK_EMAIL } from "@/lib/brand";
import { buildVTimezone } from "@/lib/vtimezone";

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

/** Folds long content lines to the 75-octet limit required by RFC 5545. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.substring(0, 75)];
  let i = 75;
  while (i < line.length) {
    chunks.push(" " + line.substring(i, i + 74));
    i += 74;
  }
  return chunks.join("\r\n");
}

/** Builds the compact `YYYYMMDDTHHMMSS` form from the typed wall-clock values. */
function compactLocal(dateStr: string, timeStr: string): string {
  const [year = "1970", month = "01", day = "01"] = dateStr.split("-");
  const [hour = "00", minute = "00"] = (timeStr || "00:00").split(":");
  return `${year}${month}${day}T${hour}${minute}00`;
}

function formatAllDay(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function utcStamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function generateUID(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${timestamp}-${random}@${BRAND.domain}`;
}

/**
 * Renders a date/time property with the correct timezone form:
 * - empty timezone  → floating local time (no suffix, no TZID)
 * - "UTC"           → absolute time with a Z suffix
 * - IANA zone       → TZID parameter (defined by an accompanying VTIMEZONE)
 */
function dateTimeProperty(prop: string, dateStr: string, timeStr: string, timezone: string): string {
  const value = compactLocal(dateStr, timeStr);
  if (!timezone) return `${prop}:${value}`;
  if (timezone === "UTC") return `${prop}:${value}Z`;
  return `${prop};TZID=${timezone}:${value}`;
}

function buildRRule(recurrence: EventFormData["recurrence"]): string {
  if (!recurrence.freq) return "";
  const parts: string[] = [`FREQ=${recurrence.freq}`];
  if (recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`);
  if (recurrence.byDay && recurrence.byDay.length > 0) {
    parts.push(`BYDAY=${recurrence.byDay.join(",")}`);
  }
  if (recurrence.byMonthDay && recurrence.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${recurrence.byMonthDay.join(",")}`);
  }
  if (typeof recurrence.bySetPos === "number" && Number.isFinite(recurrence.bySetPos)) {
    parts.push(`BYSETPOS=${recurrence.bySetPos}`);
  }
  if (recurrence.count && recurrence.count > 0) {
    parts.push(`COUNT=${recurrence.count}`);
  } else if (recurrence.until) {
    parts.push(`UNTIL=${formatAllDay(recurrence.until)}T235959Z`);
  }
  return `RRULE:${parts.join(";")}`;
}

function buildValarm(minutes: number, uid: string, summary: string): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeICSText(summary || "Reminder")}`,
    minutes === 0 ? "TRIGGER:PT0S" : `TRIGGER:-PT${minutes}M`,
    `UID:${uid}-alarm-${minutes}`,
    "END:VALARM",
  ];
}

function yearFromDate(value: string | undefined): number | null {
  if (!value) return null;
  const year = parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/** Determines a bounded year window so VTIMEZONE covers every event instance. */
function resolveYearWindow(events: EventFormData[]): { from: number; to: number } {
  const current = new Date().getFullYear();
  let min = Infinity;
  let max = -Infinity;
  let openEnded = false;

  for (const event of events) {
    const start = yearFromDate(event.startDate) ?? current;
    const end = yearFromDate(event.endDate) ?? start;
    min = Math.min(min, start);
    max = Math.max(max, end);

    if (event.recurrence?.freq) {
      const until = yearFromDate(event.recurrence.until);
      if (until) max = Math.max(max, until);
      else openEnded = true; // count-based or infinite series
    }
  }

  if (!Number.isFinite(min)) min = current;
  if (!Number.isFinite(max)) max = current;
  if (openEnded) max = Math.max(max, min + 2);

  // Pad by a year on each side, then cap the span to keep generation cheap.
  min -= 1;
  max += 1;
  if (max - min > 6) max = min + 6;
  return { from: min, to: max };
}

export function generateICS(data: EventFormData | EventFormData[]): string {
  const events = Array.isArray(data) ? data : [data];
  if (events.length === 0) return "";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${BRAND.productId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (events.length === 1) {
    lines.push(foldLine(`X-WR-CALNAME:${escapeICSText(events[0].title || "Event")}`));
    if (events[0].timezone) lines.push(`X-WR-TIMEZONE:${events[0].timezone}`);
  } else {
    lines.push(`X-WR-CALNAME:${BRAND.name} Events`);
  }

  // One VTIMEZONE per referenced IANA zone, shared by all events.
  const zones = Array.from(
    new Set(events.map((event) => event.timezone).filter((tz): tz is string => Boolean(tz) && tz !== "UTC")),
  );
  if (zones.length > 0) {
    const { from, to } = resolveYearWindow(events);
    for (const zone of zones) {
      lines.push(...buildVTimezone(zone, from, to));
    }
  }

  const dtstamp = utcStamp(new Date());

  for (const ev of events) {
    const uid = generateUID();
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`CREATED:${dtstamp}`);
    lines.push(`LAST-MODIFIED:${dtstamp}`);

    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatAllDay(ev.startDate)}`);
      // All-day DTEND is exclusive, so advance one day past the final date.
      const endDateObj = new Date(`${ev.endDate}T00:00:00`);
      endDateObj.setDate(endDateObj.getDate() + 1);
      const pad = (n: number) => n.toString().padStart(2, "0");
      lines.push(
        `DTEND;VALUE=DATE:${endDateObj.getFullYear()}${pad(endDateObj.getMonth() + 1)}${pad(endDateObj.getDate())}`,
      );
    } else {
      lines.push(dateTimeProperty("DTSTART", ev.startDate, ev.startTime, ev.timezone));
      lines.push(dateTimeProperty("DTEND", ev.endDate, ev.endTime, ev.timezone));
    }

    lines.push(foldLine(`SUMMARY:${escapeICSText(ev.title)}`));
    if (ev.description) lines.push(foldLine(`DESCRIPTION:${escapeICSText(ev.description)}`));
    if (ev.location) lines.push(foldLine(`LOCATION:${escapeICSText(ev.location)}`));
    if (ev.url) lines.push(foldLine(`URL:${ev.url}`));
    if (ev.notes) lines.push(foldLine(`COMMENT:${escapeICSText(ev.notes)}`));

    if (ev.organizer) {
      const email = ev.organizerEmail || ORGANIZER_FALLBACK_EMAIL;
      lines.push(foldLine(`ORGANIZER;CN=${escapeICSText(ev.organizer)}:MAILTO:${email}`));
    }

    if (ev.recurrence.freq) {
      const rrule = buildRRule(ev.recurrence);
      if (rrule) lines.push(foldLine(rrule));
    }

    const validExdates = (ev.exdates || []).filter((date) => date.trim() !== "");
    if (validExdates.length > 0) {
      if (ev.allDay) {
        lines.push(`EXDATE;VALUE=DATE:${validExdates.map(formatAllDay).join(",")}`);
      } else {
        lines.push(
          ...validExdates.map((date) => dateTimeProperty("EXDATE", date, ev.startTime, ev.timezone)),
        );
      }
    }

    lines.push("CLASS:PUBLIC");
    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:OPAQUE");
    lines.push("SEQUENCE:0");

    for (const reminder of ev.reminders) {
      lines.push(...buildValarm(reminder.minutes, uid, ev.title));
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
