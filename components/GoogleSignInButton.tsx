'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@heroui/react';
import { signInWithGoogle } from '@/app/(auth)/actions';
import { GoogleIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" fullWidth isPending={pending} className="glow-primary">
      {pending ? <Spinner size="sm" tone="current" /> : <GoogleIcon />}
      Google ilə davam et
    </Button>
  );
}

/**
 * `referralCode` is forwarded to signInWithGoogle so an invite link still
 * credits its referrer: Google is the only sign-in path now, and the hidden
 * field on the old email/password signup form (which used to carry this) is
 * gone. The action sanitises the value before it reaches the redirect URL.
 */
export function GoogleSignInButton({ referralCode }: { referralCode?: string | null }) {
  return (
    <form action={signInWithGoogle}>
      {referralCode ? <input type="hidden" name="ref" value={referralCode} /> : null}
      <SubmitButton />
    </form>
  );
}
