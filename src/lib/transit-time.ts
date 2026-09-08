// Converts between the transit duration a trip organizer types on the
// create screen's Timeline tab ("3h 30m") and the integer minutes the
// backend stores on TripTimelineStop.
//
// Minutes are the canonical form on purpose: they sort, add up across a
// route, and render in any language, none of which a free-text string can
// do. The screen still lets the organizer type naturally — this is the one
// place that translation happens, so the parsing rules can't drift between
// the create screen, the trip detail sheet and the map.

/**
 * Parses a human duration into whole minutes.
 *
 * Accepts `3h 30m`, `3h`, `30m`, `3 h 30 min`, `90` (bare number = minutes)
 * and `1:30` (h:mm). Returns null for anything it cannot read as a
 * duration — including qualitative words like "Overnight", which describe
 * *when* a leg happens, not how long it takes. A null means "no travel time
 * recorded", never a guessed one.
 */
export function parseTransitMinutes(input: string | null | undefined): number | null {
  const text = (input ?? '').trim().toLowerCase();
  if (!text) return null;

  // `1:30` / `12:05` — hours:minutes.
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(text);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    return hours * 60 + minutes;
  }

  // `3h 30m`, `3 hr 30 min`, `3h`, `45m`. Both parts optional but at least
  // one must be present, and a unit is required — see the bare-number case
  // below for why an unqualified number is treated separately.
  const hm = /^(?:(\d{1,3})\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d{1,3})\s*(?:m|min|mins|minute|minutes))?$/.exec(text);
  if (hm && (hm[1] !== undefined || hm[2] !== undefined)) {
    const hours = hm[1] ? Number(hm[1]) : 0;
    const minutes = hm[2] ? Number(hm[2]) : 0;
    const total = hours * 60 + minutes;
    return total > 0 ? total : null;
  }

  // A bare number is minutes, matching how the placeholder prompts for it.
  const bare = /^(\d{1,5})$/.exec(text);
  if (bare) {
    const total = Number(bare[1]);
    return total > 0 ? total : null;
  }

  return null;
}

/**
 * Renders stored minutes back as `3h 30m` / `4h` / `45m`.
 *
 * Returns null rather than a placeholder when there is nothing to show, so
 * the caller decides what an absent duration looks like instead of this
 * inventing a dash that then gets rendered as if it were data.
 */
export function formatTransitTime(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
