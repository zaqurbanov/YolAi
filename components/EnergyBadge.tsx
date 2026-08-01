'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Button } from '@heroui/react';
import { EnergyIcon } from '@/components/icons';

interface EnergyState {
  balance: number;
  max: number;
}

// Lives in NavBar as a client child so the energy count can live-update without
// converting the whole nav to a client component — the mirror image of CoinBadge
// (components/CoinBadge.tsx). Both badges fetch the SAME /api/chat?type=quota
// probe, which returns the coin balance AND the energy balance + daily top-up
// size in one call. Two live sources feed it: the mount-time fetch
// (authoritative on page load/navigation) and the 'energy-balance-update'
// window CustomEvent, dispatched by every client site that settles a currency
// move — games, wheel, quests, energy purchase/conversion, lesson unlock/retry.
// See the dispatch sites for the event contract (detail.balance = new ENERGY
// balance; never a coin value).
export default function EnergyBadge() {
  const router = useRouter();
  const [state, setState] = useState<EnergyState | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const prevBalanceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadQuota() {
      try {
        const res = await fetch('/api/chat?type=quota');
        if (!res.ok) return;
        const data: { exempt: boolean; energy?: number; maxEnergy?: number } = await res.json();
        if (cancelled) return;
        if (data.exempt) return; // admins are exempt — NavBar hides this badge for them anyway
        if (typeof data.energy === 'number' && typeof data.maxEnergy === 'number') {
          prevBalanceRef.current = data.energy;
          setState({ balance: data.energy, max: data.maxEnergy });
        }
      } catch {
        // Silent: badge just stays hidden (matches CoinBadge's mount-time fetch).
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
      setState((prev) => (prev ? { ...prev, balance: detail.balance } : prev));
    }
    window.addEventListener('energy-balance-update', handleUpdate);
    return () => window.removeEventListener('energy-balance-update', handleUpdate);
  }, []);

  useEffect(() => {
    if (state == null) return;
    if (prevBalanceRef.current !== null && prevBalanceRef.current !== state.balance) {
      setPulsing(true);
      const t = window.setTimeout(() => setPulsing(false), 550);
      prevBalanceRef.current = state.balance;
      return () => window.clearTimeout(t);
    }
    prevBalanceRef.current = state.balance;
  }, [state]);

  if (state == null) return null;

  return (
    <>
      <button
        data-tour="energy-badge"
        type="button"
        onClick={() => setIsModalOpen(true)}
        role="status"
        aria-live="polite"
        className={`glass-card mono-label flex items-center gap-1.5 rounded-full px-3 py-1.5 text-on-surface transition-colors hover:bg-surface-tertiary/60 ${
          pulsing ? 'coin-badge-pulse' : ''
        }`}
      >
        {/* Amber chip mirrors CoinBadge's fixed icon wrapper; energy is the
            caution-orange gameplay currency throughout the app. */}
        <span className="flex size-[19px] shrink-0 items-center justify-center rounded-full bg-caution-orange/15 text-caution-orange">
          <EnergyIcon width={13} height={13} />
        </span>
        <span className={pulsing ? 'text-primary' : ''}>{state.balance}</span>
      </button>

      <Modal.Backdrop isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[380px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Enerji balansı</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <dl className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sm text-on-surface-variant">Qalan enerji</dt>
                  <dd className="flex items-center gap-1.5 text-lg font-semibold text-on-surface">
                    <EnergyIcon width={15} height={15} className="text-caution-orange" />
                    <span className="tabular-nums">{state.balance}</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sm text-on-surface-variant">Gündəlik əlavə</dt>
                  <dd className="mono-label tabular-nums text-on-surface">{state.max}</dd>
                </div>
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  Enerji oyunlar, gündəlik missiyalar və sandıqla qazanılır — gündəlik əlavə
                  avtomatik verilir və oyunlarda xərclənir.
                </p>
              </dl>
            </Modal.Body>
            <Modal.Footer className="gap-2">
              <Button
                className="flex-1 glow-primary"
                variant="primary"
                onPress={() => {
                  setIsModalOpen(false);
                  router.push('/coin-qazan');
                }}
              >
                Enerji qazan
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
