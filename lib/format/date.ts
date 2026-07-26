// Intl.DateTimeFormat('az-AZ', ...) month names rely on ICU locale data that
// isn't guaranteed to be present in every Node/serverless runtime (Vercel
// included) — when it's missing, month names fall back to a synthetic
// pattern like "M07" instead of "iyul". These helpers assemble Azerbaijani
// dates from a hardcoded month-name array so rendering is ICU-independent.
const AZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avqust',
  'sentyabr',
  'oktyabr',
  'noyabr',
  'dekabr',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDate(date: string | Date): Date {
  return typeof date === 'string' ? new Date(date) : date;
}

// These render both server-side (admin pages — Vercel's runtime clock is UTC,
// not Baku) and client-side (chat timestamps — correct only incidentally, if
// the device's own timezone happens to be Asia/Baku). Reading d.getHours()
// etc. directly used the *runtime's* local timezone in both cases, which is
// wrong on the server: it silently displayed UTC (Baku is UTC+4) rather than
// Baku time, a 4h skew across every admin timestamp. Numeric Intl formatting
// (unlike month/weekday names, see the comment above) doesn't depend on ICU
// locale data being installed, so forcing `timeZone: 'Asia/Baku'` here is
// safe on every runtime without reintroducing the missing-ICU risk this file
// was already written to avoid.
function getBakuParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month) - 1, // 0-indexed to match AZ_MONTHS
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function formatAzDate(date: string | Date): string {
  const { day, month, year } = getBakuParts(toDate(date));
  return `${day} ${AZ_MONTHS[month]} ${year}`;
}

export function formatAzTime(date: string | Date): string {
  const { hour, minute } = getBakuParts(toDate(date));
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function formatAzDateTime(date: string | Date, opts?: { seconds?: boolean }): string {
  const d = toDate(date);
  const { second } = getBakuParts(d);
  const time = opts?.seconds ? `${formatAzTime(d)}:${pad2(second)}` : formatAzTime(d);
  return `${formatAzDate(d)} ${time}`;
}
