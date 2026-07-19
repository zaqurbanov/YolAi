'use client';

import { useEffect, useState } from 'react';
import { TextField, Label, Input, Description, Button, toast } from '@heroui/react';
import { SendIcon, CopyIcon } from '@/components/icons';

interface ReferralCardProps {
  code: string;
  bonusAmount: number;
}

export default function ReferralCard({ code, bonusAmount }: ReferralCardProps) {
  const [copied, setCopied] = useState(false);
  // Relative path renders identically on server and first client paint
  // (avoids a hydration mismatch from reading window.location during
  // render); swapped for the real absolute link once mounted.
  const [displayLink, setDisplayLink] = useState(`/signup?ref=${code}`);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayLink(`${window.location.origin}/signup?ref=${code}`);
  }, [code]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/signup?ref=${code}`);
      setCopied(true);
      toast.success('Link kopyalandı');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.danger('Linki kopyalamaq uğursuz oldu');
    }
  }

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-safety-yellow/15 text-safety-yellow">
          <SendIcon />
        </div>
        <h2 className="text-headline-md text-[18px]">Dostunu dəvət et</h2>
      </div>

      <p className="text-body-md text-on-surface-variant">
        Dostunu dəvət et, hər ikiniz {bonusAmount} coin qazanın!
      </p>

      <TextField>
        <Label>Dəvət linkin</Label>
        <div className="flex items-center gap-2">
          <Input value={displayLink} readOnly className="flex-1" />
          <Button variant="secondary" size="sm" onPress={handleCopy} className="shrink-0 gap-1.5">
            <CopyIcon width={16} height={16} />
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </Button>
        </div>
        <Description>Bu linklə qeydiyyatdan keçən dostun sənə və ona {bonusAmount} coin qazandırar.</Description>
      </TextField>
    </div>
  );
}
