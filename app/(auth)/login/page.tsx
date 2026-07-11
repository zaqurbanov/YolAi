'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, TextField, Label, Input, Button, Alert, Separator } from '@heroui/react';
import { login, type AuthFormState } from '../actions';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { Spinner } from '@/components/Spinner';

const initialState: AuthFormState = {};

function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const searchParams = useSearchParams();
  const error = state?.error ?? searchParams.get('error');

  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <Card className="w-full">
        <Card.Header>
          <Card.Title>Daxil ol</Card.Title>
        </Card.Header>
        <form action={formAction}>
          <Card.Content className="flex flex-col gap-4">
            <TextField name="email" isRequired>
              <Label>Email</Label>
              <Input type="email" />
            </TextField>
            <TextField name="password" isRequired>
              <Label>Şifrə</Label>
              <Input type="password" />
            </TextField>
            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </Card.Content>
          <Card.Footer className="flex flex-col gap-4 items-stretch">
            <Button type="submit" variant="primary" fullWidth isPending={pending}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Daxil ol
                </>
              )}
            </Button>
          </Card.Footer>
        </form>
        <Card.Content className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-sm text-muted">və ya</span>
            <Separator className="flex-1" />
          </div>
          <GoogleSignInButton />
          <p className="text-sm text-center text-muted">
            Hesabın yoxdur?{' '}
            <Link href="/signup" className="underline">
              Qeydiyyatdan keç
            </Link>
          </p>
        </Card.Content>
      </Card>
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
