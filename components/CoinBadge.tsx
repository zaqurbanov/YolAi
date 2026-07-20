'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Button } from '@heroui/react';
import { formatMsUntilReset } from '@/lib/format/coins';

interface CoinState {
  balance: number;
  exempt: boolean;
  dailyLimit?: number;
  msUntilReset?: number;
}

function formatCoinBalance(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// Lives in NavBar (server component) as a client child so the coin count can
// live-update without converting the whole nav to a client component. Two
// sources feed it: a mount-time /api/chat?type=quota fetch (authoritative on page
// load/navigation) and the 'coin-balance-update' window CustomEvent, dispatched
// by app/chat/page.tsx after each message's metadata.coins arrives — the
// lowest-risk way to bridge chat-page state into a persistent layout region.
// See app/chat/page.tsx's dispatch site for the event contract.
export default function CoinBadge() {
  const router = useRouter();
  const [state, setState] = useState<CoinState | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const prevBalanceRef = useRef<number | null>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadQuota() {
      try {
        const res = await fetch('/api/chat?type=quota');
        if (!res.ok) return;
        const data: { exempt: boolean; balance?: number; dailyLimit?: number; msUntilReset?: number } =
          await res.json();
        if (cancelled) return;
        if (data.exempt) {
          setState({ balance: 0, exempt: true });
          return;
        }
        if (data.balance != null) {
          prevBalanceRef.current = data.balance;
          setState({
            balance: data.balance,
            exempt: false,
            dailyLimit: data.dailyLimit,
            msUntilReset: data.msUntilReset,
          });
        }
      } catch {
        // Silent: badge just stays hidden (matches other mount-time fetches in this app).
      }
    }
    void loadQuota();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleUpdate(e: Event) {
      const detail = (e as CustomEvent<{ balance: number }>).detail;
      if (!detail || typeof detail.balance !== 'number') return;
      setState((prev) => (prev?.exempt ? prev : { ...prev, balance: detail.balance, exempt: false }));
    }
    window.addEventListener('coin-balance-update', handleUpdate);
    return () => window.removeEventListener('coin-balance-update', handleUpdate);
  }, []);

  useEffect(() => {
    if (state == null || state.exempt) return;
    if (prevBalanceRef.current !== null && prevBalanceRef.current !== state.balance) {
      setPulsing(true);
      const t = window.setTimeout(() => setPulsing(false), 550);
      prevBalanceRef.current = state.balance;
      return () => window.clearTimeout(t);
    }
    prevBalanceRef.current = state.balance;
  }, [state]);

  if (state == null || state.exempt) return null;

  return (
    <>
      <button
        ref={badgeRef}
        data-tour="coin-badge"
        type="button"
        onClick={() => setIsModalOpen(true)}
        role="status"
        aria-live="polite"
        className={`glass-card mono-label flex items-center gap-1.5 rounded-full px-3 py-1.5 text-on-surface transition-colors hover:bg-surface-tertiary/60 ${
          pulsing ? 'coin-badge-pulse' : ''
        }`}
      >
        {/* coin.gif has a black background baked into the asset (no transparent
            variant) — same class of bug --hero-image-opacity fixes for the home
            hero image in app/globals.css: a black-background asset reads as a
            jarring patch against light theme's near-white surfaces. Fixed here
            with a small fixed-dark chip behind the icon instead (an opacity trick
            doesn't work for a small non-decorative icon that needs to stay crisp)
            — bg-black/80 blends into dark theme's already-near-black surface too,
            so this one wrapper works for both themes without a theme conditional. */}
        <span className="flex size-[19px] shrink-0 items-center justify-center rounded-full bg-black/80">
          {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF, next/image would strip the animation without unoptimized */}
          <img src="/coin.gif" alt="" width={15} height={15} />
        </span>
        <span className={pulsing ? 'text-primary' : ''}>{formatCoinBalance(state.balance)}</span>
      </button>

      <Modal.Backdrop isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[380px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Coin balansı</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <dl className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sm text-on-surface-variant">Qalan coin</dt>
                  <dd className="text-lg font-semibold text-on-surface">{formatCoinBalance(state.balance)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sm text-on-surface-variant">Gündəlik limit</dt>
                  <dd className="mono-label text-on-surface">
                    {state.dailyLimit != null ? formatCoinBalance(state.dailyLimit) : '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sm text-on-surface-variant">Sıfırlanmaya qalan vaxt</dt>
                  <dd className="mono-label text-on-surface">
                    {state.msUntilReset != null ? formatMsUntilReset(state.msUntilReset) : '—'}
                  </dd>
                </div>
              </dl>
            </Modal.Body>
            <Modal.Footer className="gap-2">
              <Button
                className="flex-1 glow-primary"
                variant="primary"
                onPress={() => {
                  setIsModalOpen(false);
                  router.push('/qiymetler');
                }}
              >
                Coin al
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                onPress={() => {
                  setIsModalOpen(false);
                  router.push('/coin-qazan');
                }}
              >
                Coin qazan
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
