const twoDigit = (value: number): string => value.toString().padStart(2, "0");

export function getOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUTC = Date.UTC(
    parseInt(lookup.year, 10),
    parseInt(lookup.month, 10) - 1,
    parseInt(lookup.day, 10),
    parseInt(lookup.hour, 10),
    parseInt(lookup.minute, 10),
    parseInt(lookup.second, 10),
  );
  // IANA offsets are always whole minutes; round to absorb the sub-second
  // difference between the second-resolution wall time and the input instant.
  return Math.round((asUTC - date.getTime()) / 60000);
}

export function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour = 0, minute = 0] = (timeStr || "00:00").split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  if (!timeZone || timeZone === "UTC") {
    if (timeZone === "UTC") return utcGuess;
    return new Date(`${dateStr}T${twoDigit(hour)}:${twoDigit(minute)}:00`);
  }

  const offsetA = getOffsetMinutes(utcGuess, timeZone);
  let adjusted = new Date(utcGuess.getTime() - offsetA * 60000);
  const offsetB = getOffsetMinutes(adjusted, timeZone);
  if (offsetA !== offsetB) {
    adjusted = new Date(utcGuess.getTime() - offsetB * 60000);
  }
  return adjusted;
}

export function formatDateToParts(date: Date, timeZone: string): { date: string; time: string } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    time: `${lookup.hour}:${lookup.minute}`,
  };
}

export function formatDisplayDateTime(
  dateStr: string,
  timeStr: string,
  sourceTimeZone: string,
  targetTimeZone: string,
): string {
  const source = sourceTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const target = targetTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const utcDate = zonedDateTimeToUtc(dateStr, timeStr, source);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: target,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return formatter.format(utcDate);
}

