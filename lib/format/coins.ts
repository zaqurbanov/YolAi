// Strips trailing zeros from a numeric(10,2) coin value for display,
// e.g. 9.00 -> "9", 9.50 -> "9.5". Shared between the admin users list
// and the user detail page so the two don't drift.
export function formatCoinBalance(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// Shared between the account page's reset countdown and the insufficient-coins
// chat error message (lib/chat/coins.ts) so the two never drift on wording.
export function formatMsUntilReset(ms: number): string {
  if (ms <= 0) return 'indi';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} dəqiqə`;
  if (minutes === 0) return `${hours} saat`;
  return `${hours} saat ${minutes} dəqiqə`;
}
