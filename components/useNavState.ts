'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { NotificationRow } from '@/lib/notifications/notifications';

export interface NavState {
  user: {
    id: string;
    email: string | null;
    fullName?: string | null;
    avatarUrl?: string | null;
  } | null;
  isAdmin: boolean;
  logoUrl: string | null;
  unreadCount: number;
  notifications: NotificationRow[];
}

// NavBar and Sidebar both need the exact same payload and both mount in the
// root layout on every page — without this, every navigation would fire two
// identical requests. One in-flight promise shared between them, plus a
// resolved cache the next render can paint from immediately. Deliberately not a
// context provider: the two consumers are siblings under providers that already
// exist, and a third provider in the root layout buys nothing here.
//
// STALE-WHILE-REVALIDATE, not read-through. The cache used to SHORT-CIRCUIT the
// fetch: once populated, a client-side route change reused it forever. That is
// what made the nav keep showing a signed-out user's name and coin balance
// after logout — logout is a server action that redirects, and a server-side
// redirect cannot clear a module-level variable living in the browser. The same
// bug ran in reverse after an email login (nav stayed logged-out on the page
// you landed on).
//
// Now the cache only decides what to PAINT FIRST; every route change still
// revalidates in the background and updates if the identity changed. Explicit
// invalidateNavState() calls at the known transitions remain, so those correct
// instantly instead of one paint later — but nothing depends on a future call
// site remembering to make them.
//
// The cost is one small request per client-side navigation. It is one, not two:
// `inFlight` still collapses NavBar's and Sidebar's simultaneous calls into a
// single fetch, which was the actual reason this module exists.
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
  // Seeded from the cache so a repeat navigation paints the known identity
  // immediately; the effect below then confirms or corrects it.
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
    // Re-run per route: this is the revalidation half of the
    // stale-while-revalidate described at the top of the file, and the reason
    // a logout or login is reflected even when the transition forgot to call
    // invalidateNavState().
  }, [pathname]);

  return state;
}
