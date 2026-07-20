'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { NotificationRow } from '@/lib/notifications/notifications';

export interface NavState {
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
  logoUrl: string | null;
  unreadCount: number;
  notifications: NotificationRow[];
}

// NavBar and Sidebar both need the exact same payload and both mount in the
// root layout on every page — without this, every navigation would fire two
// identical requests. One in-flight promise shared between them, plus a
// resolved cache so a client-side route change reuses the answer instead of
// refetching. Deliberately not a context provider: the two consumers are
// siblings under providers that already exist, and a third provider in the
// root layout buys nothing here.
let cached: NavState | null = null;
let inFlight: Promise<NavState | null> | null = null;

const ANON: NavState = {
  user: null,
  isAdmin: false,
  logoUrl: null,
  unreadCount: 0,
  notifications: [],
};

async function fetchNavState(): Promise<NavState | null> {
  try {
    const res = await fetch('/api/admin/chat-meta?type=nav-state');
    if (!res.ok) return null;
    return (await res.json()) as NavState;
  } catch {
    return null;
  }
}

function loadNavState(): Promise<NavState | null> {
  if (cached) return Promise.resolve(cached);
  inFlight ??= fetchNavState().then((state) => {
    if (state) cached = state;
    inFlight = null;
    return state;
  });
  return inFlight;
}

// Called after a login/logout so the nav doesn't keep showing stale identity
// until a full reload.
export function invalidateNavState() {
  cached = null;
  inFlight = null;
}

/**
 * `null` means "not known yet" — callers must render a neutral placeholder for
 * it rather than falling back to the logged-out nav, otherwise a logged-in user
 * sees login/signup links for the duration of the fetch.
 */
export function useNavState(): NavState | null {
  const pathname = usePathname();
  const [state, setState] = useState<NavState | null>(cached);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const next = await loadNavState();
      // A failed fetch degrades to the logged-out shape: an unauthenticated
      // visitor is the only case that can't act on nav links anyway, and
      // leaving the nav in its placeholder state forever is worse.
      if (!cancelled) setState(next ?? ANON);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Re-evaluated per route so a navigation that follows a login/logout
    // (which calls invalidateNavState) picks up the new identity.
  }, [pathname]);

  return state;
}
