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

export function formatAzDate(date: string | Date): string {
  const d = toDate(date);
  return `${d.getDate()} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatAzTime(date: string | Date): string {
  const d = toDate(date);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatAzDateTime(date: string | Date, opts?: { seconds?: boolean }): string {
  const d = toDate(date);
  const time = opts?.seconds ? `${formatAzTime(d)}:${pad2(d.getSeconds())}` : formatAzTime(d);
  return `${formatAzDate(d)} ${time}`;
}
