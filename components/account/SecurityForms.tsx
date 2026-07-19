'use client';

import { useActionState } from 'react';
import { TextField, Label, Input, Button, Alert } from '@heroui/react';
import { changePassword, type AccountFormState } from '@/app/account/actions';
import { Spinner } from '@/components/Spinner';
import { ShieldIcon } from '@/components/icons';

const initialState: AccountFormState = {};

function FormAlert({ state }: { state: AccountFormState }) {
  if (state.error) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{state.error}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (state.success) {
    return (
      <Alert status="success">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{state.success}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return null;
}

export default function SecurityForms() {
  const [passwordState, passwordAction, passwordPending] = useActionState(changePassword, initialState);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-regulatory-blue/15 text-regulatory-blue">
          <ShieldIcon />
        </div>
        <h2 className="text-headline-md text-[18px]">Təhlükəsizlik</h2>
      </div>

      <form action={passwordAction} className="space-y-4">
        <TextField name="password" isRequired>
          <Label>Yeni şifrə</Label>
          <Input type="password" placeholder="Ən azı 8 simvol" />
        </TextField>
        <TextField name="confirmPassword" isRequired>
          <Label>Şifrəni təsdiqlə</Label>
          <Input type="password" />
        </TextField>
        <FormAlert state={passwordState} />
        <Button type="submit" variant="outline" isPending={passwordPending}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner size="sm" tone="current" /> : null}
              Şifrə dəyişdir
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
