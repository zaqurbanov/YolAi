'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@heroui/react';
import { signInWithGoogle } from '@/app/(auth)/actions';
import { GoogleIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="tertiary" fullWidth isPending={pending}>
      {pending ? <Spinner size="sm" /> : <GoogleIcon />}
      Google ilə davam et
    </Button>
  );
}

export function GoogleSignInButton() {
  return (
    <form action={signInWithGoogle}>
      <SubmitButton />
    </form>
  );
}
