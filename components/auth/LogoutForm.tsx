'use client';

import type { ReactNode } from 'react';
import { logout } from '@/app/(auth)/actions';
import { invalidateNavState } from '@/components/useNavState';

interface LogoutFormProps {
  /** The submit control — each surface styles its own button. */
  children: ReactNode;
  className?: string;
  /** Extra work on submit, e.g. closing the menu the button lives in. */
  onSubmitted?: () => void;
}

// THE logout form. Every "Çıxış" button in the app renders through this one
// component, and the reason is a bug that existed in three of them:
//
// `logout` is a server action that redirects. A server-side redirect cannot
// clear the module-level nav cache in components/useNavState.ts, so the sidebar
// and top bar kept showing the signed-out user's name, avatar and coin balance
// on the /login page they had just been sent to. The sidebar's form called
// invalidateNavState(); the mobile account menu's and the account page's did
// not — three copies of the same form, one of which remembered.
//
// useNavState now revalidates on every route change, so a missed invalidation
// self-corrects a paint later. This component is the other half: it makes the
// correction instant, and makes it impossible to add a fourth logout button
// that forgets.
export default function LogoutForm({ children, className, onSubmitted }: LogoutFormProps) {
  return (
    <form
      action={logout}
      className={className}
      onSubmit={() => {
        invalidateNavState();
        onSubmitted?.();
      }}
    >
      {children}
    </form>
  );
}
