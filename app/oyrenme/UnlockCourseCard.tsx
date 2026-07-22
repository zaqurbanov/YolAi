'use client';

import { useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal } from '@heroui/react';
import { CoinIcon, LockIcon } from '@/components/icons';
import { formatCoinBalance } from '@/lib/format/coins';
import { unlockCourseAction, type UnlockCourseState } from './actions';

interface UnlockCourseCardProps {
  courseId: string;
  title: string;
  /** Display only — the action resolves the real price server-side. */
  price: number;
  /** Display only, may be null when the balance read failed (it fails open). */
  balance: number | null;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

// Client wrapper around a LOCKED course card: the card itself is the trigger and
// the purchase dialog lives here. Only this branch is interactive, so CourseGrid
// stays a server component and free/open cards ship no JS.
//
// courseId is the only thing handed to the server action. The price rendered
// here is decoration; unlockLessonCourse() resolves and charges its own.
export default function UnlockCourseCard({
  courseId,
  title,
  price,
  balance,
  className,
  style,
  children,
}: UnlockCourseCardProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<UnlockCourseState | null>(null);
  const [isPending, startTransition] = useTransition();
  // 'no_content' means there is nothing to sell in this course; revalidation
  // won't change that, so stop offering the purchase for the rest of the session.
  const [unavailable, setUnavailable] = useState(false);

  function handleOpenChange(open: boolean) {
    if (isPending) return;
    setIsOpen(open);
    if (!open) setResult(null);
  }

  function handleBuy() {
    if (isPending) return;
    startTransition(async () => {
      const res = await unlockCourseAction(courseId);

      if (res.status === 'already_unlocked') {
        // Not a failure — the page was just stale. Drop straight into the
        // unlocked state instead of showing an error the user can't act on.
        setIsOpen(false);
        setResult(null);
        router.refresh();
        return;
      }

      setResult(res);
      if (res.status === 'success') router.refresh();
      if (res.status === 'no_content') setUnavailable(true);
    });
  }

  const status = result?.status;
  const shownBalance = result?.balance ?? balance;
  const shownPrice = result?.price ?? price;

  const missing =
    result?.missing ??
    (typeof result?.price === 'number' && typeof result?.balance === 'number'
      ? Math.max(0, result.price - result.balance)
      : typeof balance === 'number'
        ? Math.max(0, price - balance)
        : null);

  return (
    <>
      <button
        type="button"
        disabled={unavailable}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        style={style}
        className={`${className ?? ''} w-full cursor-pointer text-left transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60`}
      >
        {children}
      </button>

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
                  ? 'Kurs açıldı'
                  : status === 'insufficient_coins'
                    ? 'Balans kifayət etmir'
                    : 'Kursu aç'}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              <p className="text-body-md text-on-surface">{title}</p>

              {status === undefined && (
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
              )}

              {status === undefined && (
                <p className="mt-3 text-label-sm text-on-surface-variant">
                  Birdəfəlik ödəniş — kurs həmişəlik açıq qalır.
                </p>
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
                    {missing != null
                      ? `${formatCoinBalance(missing)} coin çatmır.`
                      : result?.message}
                  </p>
                </div>
              )}

              {status === 'unauthenticated' && (
                <p className="mt-4 text-label-sm text-on-surface-variant">{result?.message}</p>
              )}

              {(status === 'no_content' ||
                status === 'invalid_course' ||
                status === 'already_free' ||
                status === 'error') && (
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
                    Kursu aç
                  </Button>
                </>
              )}

              {status === 'success' && (
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
                      setIsOpen(false);
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
                      setIsOpen(false);
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
                    setIsOpen(false);
                    router.push('/login');
                  }}
                >
                  Daxil ol
                </Button>
              )}

              {status === 'no_content' && (
                <Button className="w-full" variant="outline" onPress={() => handleOpenChange(false)}>
                  Bağla
                </Button>
              )}

              {(status === 'invalid_course' || status === 'already_free' || status === 'error') && (
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
    </>
  );
}
