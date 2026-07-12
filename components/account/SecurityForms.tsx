'use client';

import { useActionState } from 'react';
import { TextField, Label, Input, Button, Alert, Separator } from '@heroui/react';
import { changeEmail, changePassword, type AccountFormState } from '@/app/account/actions';
import { Spinner } from '@/components/Spinner';

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
  const [emailState, emailAction, emailPending] = useActionState(changeEmail, initialState);
  const [passwordState, passwordAction, passwordPending] = useActionState(changePassword, initialState);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <h2 className="mono-label uppercase text-on-surface-variant">Təhlükəsizlik</h2>

      <form action={emailAction} className="space-y-4">
        <TextField name="email" isRequired>
          <Label>Yeni email</Label>
          <Input type="email" placeholder="ad@nümunə.az" />
        </TextField>
        <FormAlert state={emailState} />
        <Button type="submit" variant="outline" isPending={emailPending}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner size="sm" tone="current" /> : null}
              Email dəyişdir
            </>
          )}
        </Button>
      </form>

      <Separator />

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
