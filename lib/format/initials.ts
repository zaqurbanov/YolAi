// Avatar initials, in ONE place.
//
// THE BUG THIS FIXES: two of the three copies of this helper split the whole
// source string on /[\s@.]+/ and took the first two pieces. Fed an email that
// is the usual case here, `zaur@gmail.com` became ["zaur", "gmail", "com"] →
// "ZG" — so every Gmail user in the app wore a second initial of G, every
// Yandex user a Y, and so on. The second letter described the mail provider,
// not the person.
//
// THE RULE NOW:
//   1. A real name wins: "Zaur Qurbanov" → "ZQ".
//   2. Otherwise use only the LOCAL PART of the email — everything after `@` is
//      the provider and never says anything about the user.
//   3. Inside that local part, split on the separators people actually use in
//      addresses (. _ -) so "zaur.qurbanov" → "ZQ", while a plain "zaur" → "Z".
//      One honest initial beats two where the second is noise.
//
// Digits are dropped, so "qurbanovzaur078" → "Q" rather than "Q0".

const NAME_SEPARATORS = /\s+/;
const EMAIL_LOCAL_SEPARATORS = /[._-]+/;

function initialsOf(parts: string[]): string {
  return parts
    .map((part) => part.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/**
 * @param name  The user's display name, when they have set one.
 * @param email Fallback identity. Only the part before `@` is ever used.
 * @returns One or two letters, or '?' when neither input carries any.
 */
export function initialsFrom(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const fromName = initialsOf(trimmedName.split(NAME_SEPARATORS));
    if (fromName) return fromName;
  }

  const localPart = email?.trim().split('@')[0] ?? '';
  if (localPart) {
    const fromEmail = initialsOf(localPart.split(EMAIL_LOCAL_SEPARATORS));
    if (fromEmail) return fromEmail;
  }

  return '?';
}
