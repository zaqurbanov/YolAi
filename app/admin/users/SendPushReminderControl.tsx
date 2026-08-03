'use client';

import { useState, useTransition } from 'react';
import { Button, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { sendPushReminderToAll } from './pushActions';

export default function SendPushReminderControl() {
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<{ sent: number; cleaned: number; failed: number } | null>(null);

  function handleSend() {
    startTransition(async () => {
      const result = await sendPushReminderToAll();
      if (result.error) {
        toast.danger(result.error);
        return;
      }
      setLastResult({ sent: result.sent ?? 0, cleaned: result.cleaned ?? 0, failed: result.failed ?? 0 });
      toast.success(`Göndərildi: ${result.sent ?? 0}`);
    });
  }

  return (
    <div className="rounded-3xl border border-border/40 bg-surface p-6 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
      <div>
        <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">Push xatırlatma</div>
        {lastResult ? (
          <div className="mt-1 text-[13px] text-on-surface-variant">
            Göndərildi: {lastResult.sent} · Təmizləndi: {lastResult.cleaned} · Uğursuz: {lastResult.failed}
          </div>
        ) : (
          <div className="mt-1 text-[13px] text-on-surface-variant">Bütün abunəçilərə push bildirişi göndər</div>
        )}
      </div>

      <Button variant="outline" size="sm" isPending={pending} onPress={handleSend} className="rounded-full">
        {({ isPending }) => (
          <>
            {isPending ? <Spinner size="sm" tone="current" /> : null}
            Bütün abunəçilərə xatırlatma göndər
          </>
        )}
      </Button>
    </div>
  );
}
