'use client';

import { useEffect, useState, useTransition } from 'react';
import { Modal, Button, toast } from '@heroui/react';
import { SparkleIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';
import { claimAdWatchRewardAction, startAdViewAction } from '@/app/coin-qazan/actions';

interface AdWatchCardProps {
  adsEnabled: boolean;
  reward: number;
  dailyMax: number;
  claimsToday: number;
}

const COUNTDOWN_SECONDS = 5;

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

  // Mint the token first, then open the modal — the countdown must not start
  // before the server has recorded issued_at, otherwise an honest user who
  // watches the full ad could still be told they claimed too early.
  async function handleStart() {
    setIsStarting(true);
    try {
      const result = await startAdViewAction();
      if (result.status !== 'success' || !result.nonce) {
        toast.danger(result.message ?? 'Xəta baş verdi. Bir az sonra yenidən cəhd edin');
        return;
      }
      setNonce(result.nonce);
      setIsModalOpen(true);
    } finally {
      setIsStarting(false);
    }
  }

  function handleModalOpenChange(open: boolean) {
    setIsModalOpen(open);
    // Drop the token on close so a stale one is never replayed on the next
    // view — the server would reject it anyway (single-use), but holding it
    // client-side serves no purpose.
    if (!open) setNonce(null);
  }

  function handleClaim() {
    if (!nonce) return;
    startTransition(async () => {
      const result = await claimAdWatchRewardAction(nonce);
      if (result.status === 'success') {
        toast.success(result.message);
        if (result.balance != null) {
          window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: result.balance } }));
        }
        handleModalOpenChange(false);
        setClaimsUsed((c) => c + 1);
      } else if (result.status === 'daily_limit_reached') {
        toast.danger(result.message);
        handleModalOpenChange(false);
        setClaimsUsed(dailyMax);
      } else if (result.status === 'too_early') {
        // Server clock says the ad wasn't watched long enough — keep the
        // modal open so an honest user can simply wait a moment and retry.
        toast.danger(result.message);
      } else {
        // invalid_token (expired/consumed/unknown) or a generic error: the
        // token is spent either way, so close and let them start over.
        toast.danger(result.message || 'Xəta baş verdi. Bir az sonra yenidən cəhd edin');
        handleModalOpenChange(false);
      }
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

      <Modal.Backdrop isOpen={isModalOpen} onOpenChange={handleModalOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[380px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Reklam izlə</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-body-md text-on-surface-variant">
                {secondsLeft > 0
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
