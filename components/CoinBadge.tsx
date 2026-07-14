'use client';

import { useEffect, useRef, useState } from 'react';
import { CoinIcon } from '@/components/icons';

interface CoinState {
  balance: number;
  exempt: boolean;
}

function formatCoinBalance(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// Lives in NavBar (server component) as a client child so the coin count can
// live-update without converting the whole nav to a client component. Two
// sources feed it: a mount-time /api/chat/quota fetch (authoritative on page
// load/navigation) and the 'coin-balance-update' window CustomEvent, dispatched
// by app/chat/page.tsx after each message's metadata.coins arrives — the
// lowest-risk way to bridge chat-page state into a persistent layout region.
// See app/chat/page.tsx's dispatch site for the event contract.
export default function CoinBadge() {
  const [state, setState] = useState<CoinState | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const prevBalanceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadQuota() {
      try {
        const res = await fetch('/api/chat/quota');
        if (!res.ok) return;
        const data: { exempt: boolean; balance?: number } = await res.json();
        if (cancelled) return;
        if (data.exempt) {
          setState({ balance: 0, exempt: true });
          return;
        }
        if (data.balance != null) {
          prevBalanceRef.current = data.balance;
          setState({ balance: data.balance, exempt: false });
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
      setState((prev) => (prev?.exempt ? prev : { balance: detail.balance, exempt: false }));
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
    <div
      role="status"
      aria-live="polite"
      className={`glass-card mono-label flex items-center gap-1.5 rounded-full px-3 py-1.5 text-on-surface ${
        pulsing ? 'coin-badge-pulse' : ''
      }`}
    >
      <CoinIcon width={15} height={15} className={pulsing ? 'text-primary' : 'text-on-surface-variant'} />
      <span className={pulsing ? 'text-primary' : ''}>{formatCoinBalance(state.balance)}</span>
    </div>
  );
}
