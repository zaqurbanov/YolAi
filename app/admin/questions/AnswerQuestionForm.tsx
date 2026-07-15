'use client';

import { useActionState } from 'react';
import { TextArea, Button, Alert } from '@heroui/react';
import { answerQuestionAction, type AdminQuestionsFormState } from './actions';
import { Spinner } from '@/components/Spinner';

const initialState: AdminQuestionsFormState = {};

interface AnswerQuestionFormProps {
  questionId: string;
}

export default function AnswerQuestionForm({ questionId }: AnswerQuestionFormProps) {
  const [state, formAction, pending] = useActionState(answerQuestionAction, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-3" key={state.success}>
      <input type="hidden" name="questionId" value={questionId} />
      <TextArea name="answer" rows={3} placeholder="Cavabınızı yazın..." aria-label="Cavab" />

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

      <Button type="submit" variant="primary" size="sm" isPending={pending}>
        {({ isPending }) => (
          <>
            {isPending ? <Spinner size="sm" tone="current" /> : null}
            Cavab göndər
          </>
        )}
      </Button>
    </form>
  );
}
