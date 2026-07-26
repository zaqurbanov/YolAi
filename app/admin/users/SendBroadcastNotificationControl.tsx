'use client';

import { useState, useTransition } from 'react';
import { Button, TextArea, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { sendBroadcastNotification } from './pushActions';

const MAX_MESSAGE_LENGTH = 500;

export default function SendBroadcastNotificationControl() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number } | null>(null);

  const trimmed = message.trim();
  const disabled = pending || trimmed.length === 0;

  function handleSend() {
    if (disabled) return;
    startTransition(async () => {
      const result = await sendBroadcastNotification(trimmed);
      if (result.error) {
        toast.danger(result.error);
        return;
      }
      setLastResult({ sent: result.sent ?? 0, failed: result.failed ?? 0 });
      toast.success(`Göndərildi: ${result.sent ?? 0}`);
      setMessage('');
    });
  }

  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <div className="mono-label text-on-surface-variant uppercase">Tətbiqdaxili bildiriş</div>
        {lastResult ? (
          <div className="mt-1 text-label-sm text-on-surface-variant">
            Göndərildi: {lastResult.sent} · Uğursuz: {lastResult.failed}
          </div>
        ) : (
          <div className="mt-1 text-label-sm text-on-surface-variant">Bütün istifadəçilərə bildiriş göndər</div>
        )}
      </div>

      <TextArea
        aria-label="Bildiriş mesajı"
        placeholder="Bildiriş mətnini daxil edin..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={3}
        fullWidth
        disabled={pending}
      />
      <div className="flex items-center justify-between gap-4">
        <span className="text-label-sm text-on-surface-variant">
          {trimmed.length} / {MAX_MESSAGE_LENGTH}
        </span>
        <Button variant="outline" size="sm" isDisabled={disabled} isPending={pending} onPress={handleSend}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner size="sm" tone="current" /> : null}
              Bütün istifadəçilərə göndər
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
