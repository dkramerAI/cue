import { getOffsetMinutes } from "@/lib/time";

/**
 * Builds RFC 5545 VTIMEZONE components for IANA time zones.
 *
 * Apple Calendar resolves bare TZIDs from its built-in IANA database, but
 * stricter clients (notably Outlook) need an explicit VTIMEZONE definition or
 * they fall back to UTC and shift every event. We derive the daylight/standard
 * transitions directly from the Intl engine so the output always matches the
 * platform's own time zone data — no bundled tz database required.
 */

const SECOND = 1000;
const DAY = 86_400_000;

function pad(value: number): string {
  return Math.abs(value).toString().padStart(2, "0");
}

/** Converts an offset in minutes (local − UTC) to the ICS form, e.g. -0500. */
function offsetToICS(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** Renders an instant as the wall-clock time observed under a given offset. */
function instantToWall(instant: Date, offsetMinutes: number): string {
  const local = new Date(instant.getTime() + offsetMinutes * 60_000);
  return (
    `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}${pad(local.getUTCSeconds())}`
  );
}

function tzAbbreviation(instant: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(instant);
    return parts.find((part) => part.type === "timeZoneName")?.value || timeZone;
  } catch {
    return timeZone;
  }
}

interface Transition {
  instant: Date;
  offsetBefore: number;
  offsetAfter: number;
}

/** Finds every UTC↔local offset change for a zone within [fromYear, toYear]. */
function findTransitions(timeZone: string, fromYear: number, toYear: number): Transition[] {
  const transitions: Transition[] = [];
  const end = Date.UTC(toYear, 11, 31, 23, 59, 59);
  let cursor = Date.UTC(fromYear, 0, 1, 0, 0, 0);
  let prevOffset = getOffsetMinutes(new Date(cursor), timeZone);

  while (cursor < end) {
    const next = Math.min(cursor + DAY, end);
    const nextOffset = getOffsetMinutes(new Date(next), timeZone);

    if (nextOffset !== prevOffset) {
      // Narrow the day-wide window down to the exact transition second.
      let low = cursor;
      let high = next;
      while (high - low > SECOND) {
        const mid = low + Math.floor((high - low) / 2);
        if (getOffsetMinutes(new Date(mid), timeZone) === prevOffset) {
          low = mid;
        } else {
          high = mid;
        }
      }
      transitions.push({ instant: new Date(high), offsetBefore: prevOffset, offsetAfter: nextOffset });
      prevOffset = nextOffset;
    }

    cursor = next;
  }

  return transitions;
}

function buildSubcomponent(transition: Transition, timeZone: string): string[] {
  const isDaylight = transition.offsetAfter > transition.offsetBefore;
  const sampleAfter = new Date(transition.instant.getTime() + 60 * 60 * SECOND);
  const tag = isDaylight ? "DAYLIGHT" : "STANDARD";
  return [
    `BEGIN:${tag}`,
    `TZOFFSETFROM:${offsetToICS(transition.offsetBefore)}`,
    `TZOFFSETTO:${offsetToICS(transition.offsetAfter)}`,
    `TZNAME:${tzAbbreviation(sampleAfter, timeZone)}`,
    `DTSTART:${instantToWall(transition.instant, transition.offsetBefore)}`,
    `END:${tag}`,
  ];
}

/**
 * Builds a single VTIMEZONE block for a zone covering the given year range.
 * Returns an empty array for UTC or unknown zones (handled inline by the caller).
 */
export function buildVTimezone(timeZone: string, fromYear: number, toYear: number): string[] {
  if (!timeZone || timeZone === "UTC") return [];

  const lines: string[] = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`];
  const transitions = findTransitions(timeZone, fromYear, toYear);

  if (transitions.length === 0) {
    // No DST in range: emit one fixed STANDARD component.
    const offset = getOffsetMinutes(new Date(Date.UTC(fromYear, 0, 1)), timeZone);
    lines.push(
      "BEGIN:STANDARD",
      `TZOFFSETFROM:${offsetToICS(offset)}`,
      `TZOFFSETTO:${offsetToICS(offset)}`,
      `TZNAME:${tzAbbreviation(new Date(Date.UTC(fromYear, 0, 1)), timeZone)}`,
      "DTSTART:19700101T000000",
      "END:STANDARD",
    );
  } else {
    for (const transition of transitions) {
      lines.push(...buildSubcomponent(transition, timeZone));
    }
  }

  lines.push("END:VTIMEZONE");
  return lines;
}
