'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TextField, Label, Input, Description, Button, Alert, Separator } from '@heroui/react';
import { signup, type AuthFormState } from '../actions';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { Spinner } from '@/components/Spinner';

const initialState: AuthFormState = {};

function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const searchParams = useSearchParams();
  const error = state?.error ?? searchParams.get('error');

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
          <form action={formAction} className="flex flex-col gap-5">
            <TextField name="email" isRequired>
              <Label>Email</Label>
              <Input type="email" placeholder="ad@nümunə.com" />
            </TextField>
            <TextField name="password" isRequired>
              <Label>Şifrə</Label>
              <Input type="password" minLength={8} placeholder="••••••••" />
              <Description>Ən azı 8 simvol</Description>
            </TextField>

            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isPending={pending}
              className="glow-primary"
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Qeydiyyatdan keç
                </>
              )}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="mono-label uppercase text-on-surface-variant">və ya</span>
            <Separator className="flex-1" />
          </div>

          <GoogleSignInButton />
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
