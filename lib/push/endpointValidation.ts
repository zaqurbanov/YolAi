import 'server-only';

// A push subscription's endpoint is the URL the browser's push SERVICE gave
// it — it is always a URL on one of a small number of vendor-operated
// domains. Nothing else is a real subscription. Before this check,
// app/account/pushActions.ts only verified the field was a non-empty string,
// so `subscribeToPush({ endpoint: 'x', keys: { p256dh: 'a', auth: 'b' } })`
// earned 3 coins for a subscription that could never receive a notification.

// Exact hosts are matched literally; suffix entries match the domain itself
// or any subdomain of it.
const ALLOWED_EXACT_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
];

const ALLOWED_DOMAIN_SUFFIXES = [
  'googleapis.com', // FCM / Chrome
  'mozilla.com', // Firefox
  'notify.windows.com', // Edge / WNS
  'push.apple.com', // Safari / APNs
];

// Label-boundary suffix match, NOT a substring/`includes` test. The naive
// `hostname.includes('mozilla.com')` version accepts
// `evil-mozilla.com.attacker.net` and `notmozilla.com` — an attacker
// controls their own DNS, so a substring check is equivalent to no check at
// all. Requiring the match to begin at a '.' boundary (or be the whole
// hostname) is what makes this a real domain check.
function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || !endpoint) return false;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  // Push services are HTTPS-only; an http:// endpoint would also be a way to
  // point the server at a plaintext attacker-controlled listener.
  if (url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase();

  if (ALLOWED_EXACT_HOSTS.includes(hostname)) return true;
  return ALLOWED_DOMAIN_SUFFIXES.some((domain) => matchesDomain(hostname, domain));
}
