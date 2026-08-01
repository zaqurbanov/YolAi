'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Alert, Separator } from '@heroui/react';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

// Sign-IN is Google-first. The email+password form lives on /login/email so
// the accounts that predate the Google-only signup change keep a way in —
// it is deliberately a second step, not a competing form on this page.
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const ref = searchParams.get('ref');

  return (
    <div className="flex min-h-full w-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-on-surface">Daxil ol</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Yol Hərəkəti Qaydaları üzrə sual-cavaba davam etmək üçün hesabına daxil ol
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 sm:p-8">
          <GoogleSignInButton referralCode={ref} />

          {error && (
            <div className="mt-4">
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            </div>
          )}

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="mono-label uppercase text-on-surface-variant">və ya</span>
            <Separator className="flex-1" />
          </div>

          <Button variant="outline" fullWidth onPress={() => router.push('/login/email')}>
            Email ilə daxil ol
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
