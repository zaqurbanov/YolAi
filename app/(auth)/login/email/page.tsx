'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TextField, Label, Input, Button, Alert } from '@heroui/react';
import { login, type AuthFormState } from '../../actions';
import { Spinner } from '@/components/Spinner';
import { invalidateNavState } from '@/components/useNavState';

const initialState: AuthFormState = {};

// Sign-IN's password path moved here — see app/(auth)/login/page.tsx.
// Google is the primary entry point; this page exists so the accounts that
// predate the Google-only signup change still have a way in.
function EmailLoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const searchParams = useSearchParams();
  const error = state?.error ?? searchParams.get('error');

  return (
    <div className="flex min-h-full w-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-on-surface">Email ilə daxil ol</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Google-dan əvvəl qeydiyyatdan keçən hesabınla davam et
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 sm:p-8">
          {/* Drops the cached nav identity before the action redirects. Without
              it the sidebar and top bar keep painting the logged-OUT nav on the
              page you land on — the same staleness as logout, in reverse.
              useNavState revalidates per route as the safety net; this just
              makes the correction immediate. */}
          <form
            action={formAction}
            onSubmit={() => invalidateNavState()}
            className="flex flex-col gap-5"
          >
            <TextField name="email" isRequired>
              <Label>Email</Label>
              <Input type="email" placeholder="ad@nümunə.com" />
            </TextField>
            <TextField name="password" isRequired>
              <Label>Şifrə</Label>
              <Input type="password" placeholder="••••••••" />
            </TextField>

            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            <Button type="submit" variant="outline" fullWidth isPending={pending}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Daxil ol
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-sm text-on-surface-variant transition-colors hover:text-on-surface"
            >
              ← Geri qayıt
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EmailLoginPage() {
  return (
    <Suspense fallback={null}>
      <EmailLoginForm />
    </Suspense>
  );
}
