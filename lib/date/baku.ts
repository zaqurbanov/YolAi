// Baku (Azerbaijan) local-time day boundaries — the server-side source of truth
// for every "today" / "start of today" computation in the coin economy and
// learning features.
//
// WHY A TIMEZONE NAME, NOT A HARDCODED +4: Asia/Baku is a FIXED UTC+4 offset
// year-round (Azerbaijan abolished daylight saving in 2016, so there is no
// spring/autumn shift). We STILL resolve every boundary through the IANA tz
// NAME 'Asia/Baku' rather than writing "+4" anywhere, so the tz database stays
// the single source of truth for the offset. If the political offset ever
// changed, updating tzdata would fix every call site at once, whereas scattered
// "+4" literals would silently drift. The SQL side mirrors this exactly with
// `at time zone 'Asia/Baku'` (see supabase/migrations/0070_baku_day_boundary.sql).
//
// The frontend keeps its OWN client-side copy of the "next Baku 00:00" countdown
// logic; this module is the server-side authority. Both target Baku 00:00 by
// construction, so the two agree. This file is intentionally dependency-free
// (pure Intl) so it is safe to import from either a server or a client bundle.

const BAKU_TZ = 'Asia/Baku';
const DAY_MS = 24 * 60 * 60 * 1000;

// en-CA renders a date as YYYY-MM-DD, which is exactly the shape stored in the
// *_date columns (daily_quiz_claims.claim_date, wheel_spins.spin_date, ...) and
// produced by Postgres `(... at time zone 'Asia/Baku')::date`.
const bakuDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BAKU_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The Baku calendar day (YYYY-MM-DD) for a given instant (default: now).
export function bakuDateString(instant: Date = new Date()): string {
  return bakuDateFormatter.format(instant);
}

// 'YYYY-MM-DD' for the current Baku calendar day. Use this wherever code
// previously did `new Date().toISOString().slice(0, 10)` for a "today" key.
export function bakuTodayDate(): string {
  return bakuDateString();
}

// Offset of Asia/Baku from UTC, in milliseconds, at the given instant. Derived
// from the tz database (via the tz NAME, never a literal +4) so a future tzdata
// change is honoured automatically. Fixed at +4h in practice today.
function bakuOffsetMs(instant: Date): number {
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone: BAKU_TZ,
    timeZoneName: 'longOffset',
  })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;

  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzName ?? '');
  if (!match) return 4 * 60 * 60 * 1000; // fail to the known fixed offset
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

// Start of the Baku day (Baku 00:00) containing `instant`, as a UTC Date.
// Baku 00:00 is the instant whose Baku wall-clock reads YYYY-MM-DDT00:00:00: we
// take the Baku day-string, read it as if it were a UTC midnight, then shift
// back by the Baku offset to land on the true UTC instant.
export function bakuDayStart(instant: Date = new Date()): Date {
  const dayStr = bakuDateString(instant);
  const wallClockAsUtc = Date.parse(`${dayStr}T00:00:00Z`);
  return new Date(wallClockAsUtc - bakuOffsetMs(instant));
}

// Start of the current Baku day expressed as a UTC ISO string. Use this wherever
// code previously computed a UTC day-start ISO for a `>= created_at` filter.
export function bakuDayStartUtcIso(): string {
  return bakuDayStart().toISOString();
}

// The next Baku 00:00 strictly after `instant` (the moment daily resets fire).
export function nextBakuDayStart(instant: Date = new Date()): Date {
  return new Date(bakuDayStart(instant).getTime() + DAY_MS);
}

// Milliseconds from `instant` until the next Baku 00:00 — the value the coin
// balance modal / CoinBadge counts down. Matches the SQL reset boundary by
// construction (both are "start of the next Baku day").
export function msUntilNextBakuDayStart(instant: Date = new Date()): number {
  return nextBakuDayStart(instant).getTime() - instant.getTime();
}
