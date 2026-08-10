/**
 * Availability same-day enforcement for urgent/on-demand/ASAP jobs.
 *
 * "Same day" is evaluated in the worker's own IANA timezone so that a worker
 * in New York accepting a California ASAP job at 10 PM ET is never falsely
 * rejected because the server's UTC clock has already rolled to "tomorrow."
 */

/** Return just the YYYY-MM-DD calendar date in a given IANA timezone. */
export function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Validate that `availableFrom` falls on today's calendar date when viewed in
 * `workerTimezone`.  Returns null if valid, or an error message string if not.
 */
export function validateSameDayAvailability(
  availableFrom: Date,
  workerTimezone: string,
  now: Date = new Date(),
): string | null {
  const today = localDate(now, workerTimezone);
  const from  = localDate(availableFrom, workerTimezone);
  if (from !== today) {
    return "Urgent/on-demand jobs require same-day availability. Your availability window must start today.";
  }
  return null;
}
