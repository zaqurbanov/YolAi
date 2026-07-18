const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';

export default function AdSlot({ className }: { className?: string }) {
  if (!ADS_ENABLED) return null;

  return (
    <div
      className={`glass-card rounded-2xl border border-outline-variant/30 p-4 text-center text-body-md text-on-surface-variant ${className ?? ''}`}
    >
      Reklam yeri
    </div>
  );
}
