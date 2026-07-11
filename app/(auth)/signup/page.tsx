'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, TextField, Label, Input, Description, Button, Alert, Separator } from '@heroui/react';
import { signup, type AuthFormState } from '../actions';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { Spinner } from '@/components/Spinner';

const initialState: AuthFormState = {};

function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const searchParams = useSearchParams();
  const error = state?.error ?? searchParams.get('error');

  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <Card className="w-full">
        <Card.Header>
          <Card.Title>Qeydiyyatdan keç</Card.Title>
        </Card.Header>
        <form action={formAction}>
          <Card.Content className="flex flex-col gap-4">
            <TextField name="email" isRequired>
              <Label>Email</Label>
              <Input type="email" />
            </TextField>
            <TextField name="password" isRequired>
              <Label>Şifrə</Label>
              <Input type="password" minLength={8} />
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
          </Card.Content>
          <Card.Footer className="flex flex-col gap-4 items-stretch">
            <Button type="submit" variant="primary" fullWidth isPending={pending}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Qeydiyyatdan keç
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
            Artıq hesabın var?{' '}
            <Link href="/login" className="underline">
              Daxil ol
            </Link>
          </p>
        </Card.Content>
      </Card>
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
