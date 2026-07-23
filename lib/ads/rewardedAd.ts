// Client-side rewarded-ad abstraction.
//
// All knowledge about the ad network lives here. If we migrate to another
// network (e.g. Google Ad Manager rewarded ads), ONLY this module should
// change — callers (components/account/AdWatchCard.tsx) depend on nothing
// Monetag-specific.
//
// Modes, in priority order (see getRewardedAdMode):
//   'sdk'         — NEXT_PUBLIC_MONETAG_ZONE_ID is set. Monetag Rewarded
//                   Interstitial: fullscreen overlay, showRewardedAd()
//                   resolves when the user finishes watching. (Monetag does
//                   not currently issue this zone type for plain websites,
//                   but the code stays for a future TMA/SDK zone.)
//   'direct-link' — NEXT_PUBLIC_MONETAG_DIRECT_LINK is set (and no zone ID).
//                   The ad is just a URL opened in a new tab. There is NO
//                   "watched to completion" callback in this mode — which is
//                   why the interface exposes getDirectLinkUrl() instead of
//                   a Promise that would falsely claim to know when the ad
//                   ended. Callers must pair it with their own timing UX.
//   'none'        — nothing configured; callers keep their simulation flow.
//
// Security note: nothing in here is trusted. The client saying "I watched
// the ad" proves nothing — the reward is gated server-side by the single-use
// nonce from startAdViewAction() plus the server-clock elapsed-time check in
// lib/coins/adWatch.ts. This module only decides WHEN the client attempts
// the claim, never WHETHER it succeeds.

const SDK_URL = 'https://libtl.com/sdk.js';

// NEXT_PUBLIC_* vars are inlined at build time only when referenced as these
// exact static expressions — don't refactor into dynamic process.env access.
const ZONE_ID = process.env.NEXT_PUBLIC_MONETAG_ZONE_ID;
const DIRECT_LINK_URL = process.env.NEXT_PUBLIC_MONETAG_DIRECT_LINK;

export type RewardedAdMode = 'sdk' | 'direct-link' | 'none';

/** Which rewarded-ad implementation is active. SDK wins over Direct Link
 *  when both are configured; 'none' means callers keep their simulation. */
export function getRewardedAdMode(): RewardedAdMode {
  if (typeof ZONE_ID === 'string' && ZONE_ID.trim().length > 0) return 'sdk';
  if (typeof DIRECT_LINK_URL === 'string' && DIRECT_LINK_URL.trim().length > 0) return 'direct-link';
  return 'none';
}

/** The Direct Link ad URL, or null when not configured. Direct-link mode has
 *  no completion signal — the caller opens this in a new tab and relies on
 *  the server-side elapsed-time check for the reward gate. */
export function getDirectLinkUrl(): string | null {
  const url = DIRECT_LINK_URL?.trim();
  return url ? url : null;
}

// ---------------------------------------------------------------------------
// SDK mode (Monetag Rewarded Interstitial)
// ---------------------------------------------------------------------------
// Script: https://libtl.com/sdk.js with data-zone="<ZONE_ID>" and
// data-sdk="show_<ZONE_ID>". On load it defines window['show_<ZONE_ID>'].
// Calling show_<ZONE_ID>() opens a fullscreen rewarded interstitial and
// returns a Promise that resolves when the user finishes watching, or
// rejects on error / ad blocker / empty inventory. The SDK is injected
// lazily on first use (never in the app-wide layout), and only when a zone
// ID is configured.

type ShowFn = () => Promise<unknown>;

let sdkLoad: Promise<void> | null = null;

function loadSdk(zoneId: string): Promise<void> {
  // Already available (e.g. injected on a previous navigation)?
  if (typeof (window as unknown as Record<string, unknown>)[`show_${zoneId}`] === 'function') {
    return Promise.resolve();
  }
  if (sdkLoad) return sdkLoad;
  sdkLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.dataset.zone = zoneId;
    script.dataset.sdk = `show_${zoneId}`;
    script.onload = () => resolve();
    script.onerror = () => {
      // Reset so a later attempt can retry (ad blockers, flaky networks).
      sdkLoad = null;
      script.remove();
      reject(new Error('rewarded-ad: SDK failed to load'));
    };
    document.head.appendChild(script);
  });
  return sdkLoad;
}

/**
 * SDK mode only. Shows a rewarded ad and resolves only after the user has
 * watched it to completion. Rejects if no zone is configured, the SDK cannot
 * load (ad blocker / network), or the network reports an error / no
 * inventory.
 */
export async function showRewardedAd(): Promise<void> {
  const zoneId = ZONE_ID?.trim();
  if (!zoneId) {
    throw new Error('rewarded-ad: NEXT_PUBLIC_MONETAG_ZONE_ID is not configured');
  }
  await loadSdk(zoneId);
  const show = (window as unknown as Record<string, unknown>)[`show_${zoneId}`];
  if (typeof show !== 'function') {
    throw new Error('rewarded-ad: SDK loaded but show function is missing');
  }
  await (show as ShowFn)();
}
