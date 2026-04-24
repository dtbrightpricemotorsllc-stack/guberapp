// Job time display helper.
//
// Goal: workers and posters see the same time, in the same zone — picked as
// the job's local timezone (derived from the job's US ZIP code). When we
// can't determine the job's zone, we fall back to the viewer's local zone
// and tag the string with "(your time)" so a worker in a different zone
// notices the mismatch.

const VIEWER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
})();

// Coarse US ZIP-prefix → IANA timezone mapping. Covers the common cases for
// a US-only labor marketplace; edge cases (e.g. Indiana counties on Eastern
// vs Central) still render with a correct TZ abbreviation.
function zipToTimezone(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const z = zip.trim().slice(0, 5);
  if (!/^\d{3,5}$/.test(z)) return null;
  const prefix = parseInt(z.slice(0, 3), 10);

  if (prefix >= 967 && prefix <= 968) return "Pacific/Honolulu";
  if (prefix >= 995 && prefix <= 999) return "America/Anchorage";
  if (prefix >= 900 && prefix <= 961) return "America/Los_Angeles";
  if (prefix >= 970 && prefix <= 994) return "America/Los_Angeles";
  if (prefix >= 889 && prefix <= 898) return "America/Los_Angeles";
  if (prefix >= 850 && prefix <= 865) return "America/Phoenix"; // AZ, no DST
  if (prefix >= 870 && prefix <= 884) return "America/Denver";
  if (prefix >= 800 && prefix <= 849) return "America/Denver";
  if (prefix >= 740 && prefix <= 799) return "America/Chicago";
  if (prefix >= 620 && prefix <= 739) return "America/Chicago";
  if (prefix >= 500 && prefix <= 599) return "America/Chicago";
  if (prefix >= 386 && prefix <= 397) return "America/Chicago";
  if (prefix >= 370 && prefix <= 385) return "America/Chicago";
  if (prefix >= 350 && prefix <= 369) return "America/Chicago";
  // Eastern bucket (covers NY/NJ/MA/VA/NC/SC/FL/GA + OH/MI/KY/IN-east)
  if (prefix >= 5 && prefix <= 499) return "America/New_York";
  return null;
}

export interface JobTimeDisplay {
  /** Primary string with explicit zone abbreviation, e.g. "Apr 24, 3:00 PM CDT". */
  primary: string;
  /** Optional "(your time: ...)" tag when viewer's zone differs from the job's zone. */
  viewerLocal?: string;
  /** True when the time was rendered in the job's actual local zone. */
  inJobZone: boolean;
}

function formatInZone(date: Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz, timeZoneName: "short" }).format(date);
}

/**
 * Format a job-related timestamp with an explicit timezone label.
 *
 * @param date  The timestamp to display (Date, ISO string, or null).
 * @param zip   The job's US ZIP code (used to derive the job's local zone).
 * @param opts  Intl format options. Defaults to month/day + h:mm AM/PM.
 */
export function formatJobTime(
  date: Date | string | null | undefined,
  zip: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
): JobTimeDisplay | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;

  const jobZone = zipToTimezone(zip);

  if (jobZone) {
    const primary = formatInZone(d, jobZone, opts);
    // If viewer is in the same zone, no need for the "(your time)" tag.
    if (jobZone === VIEWER_TZ) {
      return { primary, inJobZone: true };
    }
    const viewerLocal = formatInZone(d, VIEWER_TZ, opts);
    // When the formatted strings happen to match, suppress the tag.
    if (viewerLocal === primary) {
      return { primary, inJobZone: true };
    }
    return { primary, viewerLocal: `your time: ${viewerLocal}`, inJobZone: true };
  }

  // No job zone available — fall back to viewer's local with a clear tag.
  const primary = formatInZone(d, VIEWER_TZ, opts);
  return { primary: `${primary} (your time)`, inJobZone: false };
}

/** Convenience: returns just the primary string, or "" when date is missing. */
export function jobTimeString(
  date: Date | string | null | undefined,
  zip: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return formatJobTime(date, zip, opts)?.primary ?? "";
}
