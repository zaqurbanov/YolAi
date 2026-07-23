'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Modal, Button, toast } from '@heroui/react';
import { SparkleIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';
import { claimAdWatchRewardAction, startAdViewAction } from '@/app/coin-qazan/actions';
import { getDirectLinkUrl, getRewardedAdMode, showRewardedAd } from '@/lib/ads/rewardedAd';

interface AdWatchCardProps {
  adsEnabled: boolean;
  reward: number;
  dailyMax: number;
  claimsToday: number;
}

const COUNTDOWN_SECONDS = 5;

// Ad mode is decided once from env (lib/ads/rewardedAd.ts):
// - 'sdk':         Monetag Rewarded Interstitial — fullscreen overlay, auto-
//                  claim when its Promise resolves. No modal of ours.
// - 'direct-link': Monetag Direct Link — the ad opens in a new tab, and the
//                  countdown modal below stays as the claim gate (there is no
//                  completion callback in this mode).
// - 'none':        the original 5-second simulation modal, unchanged.
// In every mode the reward is gated server-side by the single-use nonce +
// server-clock elapsed check — the client never proves anything.
const AD_MODE = getRewardedAdMode();

export default function AdWatchCard({ adsEnabled, reward, dailyMax, claimsToday }: AdWatchCardProps) {
  const [claimsUsed, setClaimsUsed] = useState(claimsToday);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [isPending, startTransition] = useTransition();
  // Server-issued single-use token for THIS ad view. The reward is only
  // payable against a token the server minted, so the countdown below is
  // presentation only — the real elapsed-time check compares the token's
  // server-recorded issued_at against the server clock at claim time (see
  // issueAdViewToken / claimAdWatchReward). A client that skips the wait
  // gets 'too_early' rather than a coin.
  const [nonce, setNonce] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  // Direct-link mode: handle of the ad tab, kept so closing the countdown
  // modal also closes the ad tab (user request — the two open together, they
  // should close together). A ref, not state: the handle is never rendered.
  const adTabRef = useRef<Window | null>(null);

  const isCapped = claimsUsed >= dailyMax;

  useEffect(() => {
    if (!isModalOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the countdown each time the modal opens, matching ReferralCard's copy-link-state reset pattern
    setSecondsLeft(COUNTDOWN_SECONDS);
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isModalOpen]);

  // Shared claim handling for all flows. `fromModal` controls whether the
  // countdown modal needs closing/keeping open; the SDK flow has no modal of
  // ours (the SDK overlay has already closed by claim time).
  async function performClaim(currentNonce: string, fromModal: boolean) {
    const result = await claimAdWatchRewardAction(currentNonce);
    if (result.status === 'success') {
      toast.success(result.message);
      if (result.balance != null) {
        window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: result.balance } }));
      }
      if (fromModal) handleModalOpenChange(false);
      setClaimsUsed((c) => c + 1);
    } else if (result.status === 'daily_limit_reached') {
      toast.danger(result.message);
      if (fromModal) handleModalOpenChange(false);
      setClaimsUsed(dailyMax);
    } else if (result.status === 'too_early') {
      // Server clock says the ad was not watched long enough — in the modal
      // flow, keep it open so an honest user can simply wait and retry.
      toast.danger(result.message);
    } else {
      // invalid_token (expired/consumed/unknown) or a generic error: the
      // token is spent either way, so close and let them start over.
      toast.danger(result.message || 'Xəta baş verdi. Bir az sonra yenidən cəhd edin');
      if (fromModal) handleModalOpenChange(false);
    }
  }

  // Mint the token first, then run the ad — the elapsed-time window must not
  // start before the server has recorded issued_at, otherwise an honest user
  // who watches the full ad could still be told they claimed too early.
  async function handleStart() {
    // Direct-link mode: popup blockers only allow window.open while we are
    // still synchronously inside the user's click-handler chain — calling it
    // after `await startAdViewAction()` gets blocked in several browsers.
    // Simplest reliable fix: open a blank tab NOW (synchronously), then
    // navigate it to the ad URL once the nonce arrives, or close it if the
    // nonce request fails. We keep a handle to the tab, so the 'noopener'
    // feature string can't be used (it makes window.open return null);
    // instead we sever the reverse handle ourselves via adTab.opener = null
    // so the ad page cannot script/navigate our app.
    let adTab: Window | null = null;
    if (AD_MODE === 'direct-link') {
      adTab = window.open('about:blank', '_blank');
      if (adTab) adTab.opener = null;
    }
    setIsStarting(true);
    try {
      const result = await startAdViewAction();
      if (result.status !== 'success' || !result.nonce) {
        adTab?.close();
        toast.danger(result.message ?? 'Xəta baş verdi. Bir az sonra yenidən cəhd edin');
        return;
      }
      if (AD_MODE === 'sdk') {
        // Monetag Rewarded Interstitial: the SDK shows its own fullscreen
        // overlay and resolves only when the user finishes watching. No
        // second click — claim automatically on resolve. On reject
        // (ad blocker / no inventory / network) the nonce is simply dropped;
        // it is single-use and expires server-side anyway.
        try {
          await showRewardedAd();
        } catch {
          toast.danger('Reklam yüklənmədi. Reklam bloklayıcısını söndürün və ya bir az sonra yenidən cəhd edin');
          return;
        }
        await performClaim(result.nonce, false);
      } else if (AD_MODE === 'direct-link') {
        // Navigate the pre-opened tab to the ad; if the popup was blocked
        // even synchronously, try a direct open as a best effort (the claim
        // gate is the server-side elapsed check, not this tab).
        const url = getDirectLinkUrl();
        if (url) {
          if (adTab) {
            adTab.location.href = url;
            adTabRef.current = adTab;
          } else {
            window.open(url, '_blank', 'noopener');
          }
        }
        // The countdown modal stays as the claim gate: "Coin al" enables
        // after COUNTDOWN_SECONDS, matching the server's minimum elapsed
        // time. Direct Link has no completion callback, so this is the
        // honest UX — we cannot know when (or whether) the ad was viewed.
        setNonce(result.nonce);
        setIsModalOpen(true);
      } else {
        // Simulation flow (nothing configured) — unchanged.
        setNonce(result.nonce);
        setIsModalOpen(true);
      }
    } finally {
      setIsStarting(false);
    }
  }

  function handleModalOpenChange(open: boolean) {
    setIsModalOpen(open);
    // Drop the token on close so a stale one is never replayed on the next
    // view — the server would reject it anyway (single-use), but holding it
    // client-side serves no purpose.
    if (!open) {
      setNonce(null);
      // Close the ad tab together with the modal (direct-link mode). Wrapped
      // in try/catch: the handle may already be dead (user closed the tab, or
      // a cross-origin navigation invalidated close() in some browsers) —
      // best effort only, never let it break the modal close.
      try {
        adTabRef.current?.close();
      } catch {
        // ignore — tab already gone or close() not permitted
      }
      adTabRef.current = null;
    }
  }

  function handleClaim() {
    if (!nonce) return;
    startTransition(async () => {
      await performClaim(nonce, true);
    });
  }

  if (!adsEnabled) {
    return (
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-caution-orange/15 text-caution-orange">
            <SparkleIcon />
          </div>
          <h2 className="text-headline-md text-[18px]">Reklam izlə</h2>
        </div>
        <p className="text-body-md text-on-surface-variant">
          Reklam izləyərək coin qazanmaq funksiyası tezliklə əlavə olunacaq.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-caution-orange/15 text-caution-orange">
          <SparkleIcon />
        </div>
        <h2 className="text-headline-md text-[18px]">Reklam izlə</h2>
      </div>

      <p className="text-body-md text-on-surface-variant">
        {claimsUsed}/{dailyMax} bugün istifadə edilib · Hər izləmə üçün {reward} coin
      </p>

      {isCapped ? (
        <Button variant="outline" isDisabled>
          Bugünkü limitə çatmısınız, sabah yenidən cəhd edin
        </Button>
      ) : (
        <Button variant="primary" onPress={handleStart} isPending={isStarting}>
          {({ isPending: pending }) => (
            <>
              {pending ? <Spinner size="sm" tone="current" /> : null}
              Reklama bax
            </>
          )}
        </Button>
      )}

      {/* Countdown modal — used by the direct-link flow (real ad opened in a
          new tab, this gates the claim) and by the simulation flow (nothing
          configured). Never opened in SDK mode. */}
      <Modal.Backdrop isOpen={isModalOpen} onOpenChange={handleModalOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[380px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Reklam izlə</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-body-md text-on-surface-variant">
                {AD_MODE === 'direct-link'
                  ? secondsLeft > 0
                    ? `Reklam açıldı — davam etmək üçün ${secondsLeft} saniyə gözləyin`
                    : 'Coin qazanmaq üçün klikləyin'
                  : secondsLeft > 0
                    ? `Reklam simulyasiyası — ${secondsLeft} saniyə`
                    : 'Reklam tamamlandı — coin qazanmaq üçün klikləyin'}
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="flex-1 glow-primary"
                variant="primary"
                onPress={handleClaim}
                isDisabled={secondsLeft > 0}
                isPending={isPending}
              >
                {({ isPending: pending }) => (
                  <>
                    {pending ? <Spinner size="sm" tone="current" /> : null}
                    Coin al
                  </>
                )}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
