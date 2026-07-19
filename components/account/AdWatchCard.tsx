'use client';

import { useEffect, useState, useTransition } from 'react';
import { Modal, Button, toast } from '@heroui/react';
import { SparkleIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';
import { claimAdWatchRewardAction } from '@/app/coin-qazan/actions';

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

  function handleClaim() {
    startTransition(async () => {
      const result = await claimAdWatchRewardAction();
      if (result.status === 'success') {
        toast.success(result.message);
        if (result.balance != null) {
          window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: result.balance } }));
        }
        setIsModalOpen(false);
        setClaimsUsed((c) => c + 1);
      } else if (result.status === 'daily_limit_reached') {
        toast.danger(result.message);
        setIsModalOpen(false);
        setClaimsUsed(dailyMax);
      } else {
        toast.danger('Xəta baş verdi. Bir az sonra yenidən cəhd edin');
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
        <Button variant="primary" onPress={() => setIsModalOpen(true)}>
          Reklama bax
        </Button>
      )}

      <Modal.Backdrop isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
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
