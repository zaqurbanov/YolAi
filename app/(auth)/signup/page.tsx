'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert } from '@heroui/react';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

// Google-only by design — the email/password form was removed along with its
// server action (see app/(auth)/actions.ts for the full rationale). Removing
// the form alone would not have been enough: the action behind it stayed
// callable as a plain POST endpoint.
function SignupForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const ref = searchParams.get('ref');

  return (
    <div className="flex min-h-full w-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-on-surface">Qeydiyyatdan keç</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Yol Hərəkəti Qaydaları üzrə sual-cavabdan istifadə etmək üçün hesab yarat
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 sm:p-8">
          {error && (
            <Alert status="danger" className="mb-5">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <GoogleSignInButton referralCode={ref} />

          <p className="mt-5 text-center text-xs text-on-surface-variant">
            Hesabınız Google ilə yaradılır — ayrıca şifrə tələb olunmur.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Artıq hesabın var?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Daxil ol
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
