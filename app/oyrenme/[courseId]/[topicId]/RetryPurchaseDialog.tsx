'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal } from '@heroui/react';
import { CoinIcon, LockIcon } from '@/components/icons';
import { formatCoinBalance } from '@/lib/format/coins';
import { purchaseRetryAction, type PurchaseRetryState } from '../../actions';

interface RetryPurchaseDialogProps {
  topicId: string;
  /** Display only — purchaseLessonRetry resolves and charges its own price. */
  price: number;
  /** Display only, may be null when the balance read failed (it fails open). */
  balance: number | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a purchase succeeds, so the test can be started again. */
  onPurchased: () => void;
}

// Paid same-day retry for one topic test. Deliberately a near-copy of
// UnlockCourseCard's dialog: PurchaseRetryState carries the same
// balance/price/missing shape as UnlockCourseState, so the pricing rows and the
// «Coin qazan» / «Coin al (tezliklə)» exits behave identically to the course
// unlock the user already went through. UnlockCourseCard itself is untouched —
// it owns a card trigger and a different action, and only the dialog body is
// actually common.
export default function RetryPurchaseDialog({
  topicId,
  price,
  balance,
  isOpen,
  onOpenChange,
  onPurchased,
}: RetryPurchaseDialogProps) {
  const router = useRouter();
  const [result, setResult] = useState<PurchaseRetryState | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(open: boolean) {
    if (isPending) return;
    onOpenChange(open);
    if (!open) setResult(null);
  }

  function handleBuy() {
    if (isPending) return;
    startTransition(async () => {
      const res = await purchaseRetryAction(topicId);
      setResult(res);

      if (res.status === 'success' || res.status === 'already_has_retry') {
        onPurchased();
        if (typeof res.balance === 'number') {
          // Same contract components/CoinBadge.tsx listens on — keeps the
          // navbar balance honest without a full reload.
          window.dispatchEvent(
            new CustomEvent('coin-balance-update', { detail: { balance: res.balance } })
          );
        }
        router.refresh();
      }
    });
  }

  const status = result?.status;
  const shownBalance = result?.balance ?? balance;
  const shownPrice = result?.price ?? price;
  const missing =
    result?.missing ?? (typeof balance === 'number' ? Math.max(0, price - balance) : null);

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      isDismissable={!isPending}
      isKeyboardDismissDisabled={isPending}
      variant="blur"
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[420px]">
          {!isPending && <Modal.CloseTrigger />}

          <Modal.Header>
            <Modal.Icon className="bg-primary/15 text-primary">
              <LockIcon width={18} height={18} />
            </Modal.Icon>
            <Modal.Heading>
              {status === 'success'
                ? 'Təkrar cəhd alındı'
                : status === 'insufficient_coins'
                  ? 'Balans kifayət etmir'
                  : 'Təkrar cəhd al'}
            </Modal.Heading>
          </Modal.Header>

          <Modal.Body>
            <p className="text-body-md text-on-surface">
              Bu mövzu üzrə bugünkü cəhdiniz istifadə olunub. Bu gün bir dəfə də cəhd etmək üçün
              təkrar cəhd ala bilərsiniz.
            </p>

            {status === undefined && (
              <>
                <dl className="mt-4 space-y-3 rounded-2xl border border-outline-variant/40 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-label-sm text-on-surface-variant">Qiymət</dt>
                    <dd className="flex items-center gap-1 text-label-sm font-semibold text-safety-yellow">
                      <CoinIcon width={15} height={15} />
                      {formatCoinBalance(price)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-label-sm text-on-surface-variant">Balansınız</dt>
                    <dd className="flex items-center gap-1 text-label-sm text-on-surface">
                      <CoinIcon width={15} height={15} />
                      {balance != null ? formatCoinBalance(balance) : '—'}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-label-sm text-on-surface-variant">
                  Sabah onsuz da yeni pulsuz cəhdiniz olacaq.
                </p>
              </>
            )}

            {status === 'success' && (
              <div className="mt-4 space-y-2 rounded-2xl border border-go-green/30 bg-go-green/5 p-4">
                <p className="text-label-sm text-go-green">{result?.message}</p>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-label-sm text-on-surface-variant">Yeni balans</span>
                  <span className="flex items-center gap-1 text-label-sm font-semibold text-on-surface">
                    <CoinIcon width={15} height={15} />
                    {shownBalance != null ? formatCoinBalance(shownBalance) : '—'}
                  </span>
                </div>
              </div>
            )}

            {status === 'insufficient_coins' && (
              <div className="mt-4 space-y-3 rounded-2xl border border-outline-variant/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-label-sm text-on-surface-variant">Qiymət</span>
                  <span className="flex items-center gap-1 text-label-sm text-on-surface">
                    <CoinIcon width={15} height={15} />
                    {formatCoinBalance(shownPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-label-sm text-on-surface-variant">Balansınız</span>
                  <span className="flex items-center gap-1 text-label-sm text-on-surface">
                    <CoinIcon width={15} height={15} />
                    {shownBalance != null ? formatCoinBalance(shownBalance) : '—'}
                  </span>
                </div>
                <p className="text-label-sm font-semibold text-safety-yellow">
                  {missing != null ? `${formatCoinBalance(missing)} coin çatmır.` : result?.message}
                </p>
              </div>
            )}

            {(status === 'not_needed' || status === 'already_has_retry') && (
              <p className="mt-4 rounded-2xl border border-go-green/30 bg-go-green/5 p-4 text-label-sm text-go-green">
                {result?.message}
              </p>
            )}

            {status === 'unauthenticated' && (
              <p className="mt-4 text-label-sm text-on-surface-variant">{result?.message}</p>
            )}

            {(status === 'not_found' || status === 'error') && (
              <p className="mt-4 rounded-2xl border border-error/30 bg-error/5 p-4 text-label-sm text-error">
                {result?.message}
              </p>
            )}
          </Modal.Body>

          <Modal.Footer className="gap-2">
            {status === undefined && (
              <>
                <Button
                  className="flex-1"
                  variant="outline"
                  isDisabled={isPending}
                  onPress={() => handleOpenChange(false)}
                >
                  İmtina
                </Button>
                <Button
                  className="glow-primary flex-1"
                  variant="primary"
                  isPending={isPending}
                  isDisabled={isPending}
                  onPress={handleBuy}
                >
                  Təkrar cəhd al
                </Button>
              </>
            )}

            {(status === 'success' ||
              status === 'not_needed' ||
              status === 'already_has_retry') && (
              <Button className="w-full" variant="primary" onPress={() => handleOpenChange(false)}>
                Bağla
              </Button>
            )}

            {status === 'insufficient_coins' && (
              <div className="flex w-full flex-col gap-2">
                <Button
                  className="glow-primary w-full"
                  variant="primary"
                  onPress={() => {
                    handleOpenChange(false);
                    router.push('/coin-qazan');
                  }}
                >
                  Coin qazan
                </Button>
                {/* /qiymetler is a "Tezliklə" page — there is no checkout yet,
                    so the label says so rather than promising a purchase. */}
                <Button
                  className="w-full"
                  variant="outline"
                  onPress={() => {
                    handleOpenChange(false);
                    router.push('/qiymetler');
                  }}
                >
                  Coin al (tezliklə)
                </Button>
              </div>
            )}

            {status === 'unauthenticated' && (
              <Button
                className="w-full"
                variant="primary"
                onPress={() => {
                  handleOpenChange(false);
                  router.push('/login');
                }}
              >
                Daxil ol
              </Button>
            )}

            {(status === 'not_found' || status === 'error') && (
              <>
                <Button
                  className="flex-1"
                  variant="outline"
                  isDisabled={isPending}
                  onPress={() => handleOpenChange(false)}
                >
                  Bağla
                </Button>
                <Button
                  className="flex-1"
                  variant="primary"
                  isPending={isPending}
                  isDisabled={isPending}
                  onPress={() => {
                    setResult(null);
                    handleBuy();
                  }}
                >
                  Yenidən cəhd et
                </Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
