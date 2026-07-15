'use client';

import { useActionState } from 'react';
import { TextField, Label, Input, Description, Button, Alert } from '@heroui/react';
import { transferCoins, type AccountFormState } from '@/app/account/actions';
import { Spinner } from '@/components/Spinner';
import { SendIcon } from '@/components/icons';

const initialState: AccountFormState = {};

interface TransferCoinsFormProps {
  minAmount: number;
}

export default function TransferCoinsForm({ minAmount }: TransferCoinsFormProps) {
  const [state, formAction, pending] = useActionState(transferCoins, initialState);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <h2 className="mono-label uppercase text-on-surface-variant">Coin göndər</h2>

      <form action={formAction} className="space-y-4" key={state.success}>
        <TextField name="recipientEmail" isRequired>
          <Label>Alıcının email ünvanı</Label>
          <Input type="email" placeholder="ad@nümunə.az" />
        </TextField>

        <TextField name="amount" isRequired>
          <Label>Miqdar</Label>
          <Input type="number" min={minAmount} step="1" placeholder={String(minAmount)} />
          <Description>Minimum köçürmə miqdarı: {minAmount} coin</Description>
        </TextField>

        {state.error && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{state.error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {state.success && (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{state.success}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <Button type="submit" variant="primary" isPending={pending}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner size="sm" tone="current" /> : <SendIcon width={16} height={16} />}
              Göndər
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
