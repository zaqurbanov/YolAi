// Client-side rewarded-ad abstraction.
//
// Interface: "show a rewarded ad, return a Promise that resolves when the
// user has watched it to completion, rejects on ad-blocker / no inventory /
// network failure". The current (and only) implementation is Monetag's
// Rewarded Interstitial. If we ever migrate to another network (e.g. Google
// Ad Manager rewarded ads), ONLY this module should change — callers
// (components/account/AdWatchCard.tsx) depend on nothing Monetag-specific.
//
// Security note: nothing in here is trusted. The client saying "I watched
// the ad" proves nothing — the reward is gated server-side by the single-use
// nonce from startAdViewAction() plus the server-clock elapsed-time check in
// lib/coins/adWatch.ts. This module only decides WHEN the client attempts
// the claim, never WHETHER it succeeds.
//
// Monetag SDK mechanics:
// - Script: https://libtl.com/sdk.js with data-zone="<ZONE_ID>" and
//   data-sdk="show_<ZONE_ID>". On load it defines window['show_<ZONE_ID>'].
// - Calling show_<ZONE_ID>() opens a fullscreen rewarded interstitial and
//   returns a Promise that resolves when the user finishes watching, or
//   rejects on error / ad blocker / empty inventory.
// - The SDK is injected lazily on first use (never in the app-wide layout),
//   and only when NEXT_PUBLIC_MONETAG_ZONE_ID is configured.

const SDK_URL = 'https://libtl.com/sdk.js';

// NEXT_PUBLIC_* vars are inlined at build time only when referenced as this
// exact static expression — don't refactor into dynamic process.env access.
const ZONE_ID = process.env.NEXT_PUBLIC_MONETAG_ZONE_ID;

/** True when a Monetag zone is configured. When false, callers must keep
 *  their non-ad behavior (AdWatchCard falls back to the simulation modal). */
export function isRewardedAdConfigured(): boolean {
  return typeof ZONE_ID === 'string' && ZONE_ID.trim().length > 0;
}

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
 * Shows a rewarded ad and resolves only after the user has watched it to
 * completion. Rejects if no zone is configured, the SDK cannot load
 * (ad blocker / network), or the network reports an error / no inventory.
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
