/**
 * Simple timezone offset utilities.
 * For production, use: `Intl.DateTimeFormat` or a library like `luxon`.
 */

/** Get timezone offset in minutes for a given timezone at a given date */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    if (!offsetPart?.value) return 0;

    // Parse "GMT+5" or "GMT-04:30" or "UTC" etc.
    const match = offsetPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;

    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3] || '0', 10);
    const sign = match[1] === '+' ? 1 : -1;

    return sign * (hours * 60 + minutes);
  } catch {
    return 0;
  }
}

/** Convert a local time (HH:mm) in a timezone to a UTC Date */
export function localToUtc(
  dateStr: string, // YYYY-MM-DD
  timeStr: string, // HH:mm
  timezone: string
): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);

  // Start with the date at the given local time
  const local = new Date(`${dateStr}T${timeStr}:00`);

  // Adjust by timezone offset
  const offset = getTimezoneOffset(timezone, local);
  const utc = new Date(local.getTime() - offset * 60000);

  // Manually set hours/minutes to be safe
  utc.setUTCHours(hours - (offset >= 0 ? Math.floor(offset / 60) : Math.ceil(offset / 60)), minutes, 0, 0);

  return utc;
}
