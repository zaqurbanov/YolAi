import { randomInt } from 'node:crypto';

// Azerbaijani-style plate format: \d{2}-[A-ZƏÇĞİÖŞÜ]{2}-\d{3}
// (2 digits, dash, 2 letters from the Azerbaijani alphabet incl. its extra
// letters, dash, 3 digits) — e.g. "77-BC-432" or "10-ŞÜ-001".

const DIGITS = '0123456789';
// Azerbaijani alphabet's uppercase consonants/vowels used on real plates,
// including the extra letters (Ə, Ç, Ğ, İ, Ö, Ş, Ü) beyond plain A-Z.
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVXYZƏÇĞİÖŞÜ';

const PLATE_REGEX = /^\d{2}-[A-ZƏÇĞİÖŞÜ]{2}-\d{3}$/;

function randomFrom(alphabet: string): string {
  return alphabet[randomInt(0, alphabet.length)];
}

function randomDigits(count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += randomFrom(DIGITS);
  return out;
}

function randomLetters(count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += randomFrom(LETTERS);
  return out;
}

// Never Math.random() for anything RNG-driven in this repo — uses
// node:crypto's randomInt, same house rule as lib/coins/signSpeed.ts's
// shuffle().
export function generateRandomPlateNumber(): string {
  return `${randomDigits(2)}-${randomLetters(2)}-${randomDigits(3)}`;
}

// Uppercases, strips whitespace, validates against PLATE_REGEX. Returns null
// (not throws) on anything invalid — callers decide how to surface that.
export function normalizePlateNumber(input: string): string | null {
  if (typeof input !== 'string') return null;
  const normalized = input.replace(/\s+/g, '').toUpperCase();
  if (!PLATE_REGEX.test(normalized)) return null;
  return normalized;
}
