'use client';

import { useActionState } from 'react';
import { TextField, Label, TextArea, Button, Alert } from '@heroui/react';
import { submitQuestionAction, type SualFormState } from '@/app/sual/actions';
import { Spinner } from '@/components/Spinner';
import { SendIcon } from '@/components/icons';

const initialState: SualFormState = {};

export default function SualForm() {
  const [state, formAction, pending] = useActionState(submitQuestionAction, initialState);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <h2 className="mono-label uppercase text-on-surface-variant">Yeni sual</h2>

      <form action={formAction} className="space-y-4" key={state.success}>
        <TextField name="question" isRequired>
          <Label>Sualınız</Label>
          <TextArea rows={4} placeholder="Sualınızı bura yazın..." />
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
