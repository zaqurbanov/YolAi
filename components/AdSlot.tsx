const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';

export default function AdSlot({ className }: { className?: string }) {
  if (!ADS_ENABLED) return null;

  return (
    <div className={`border rounded p-4 text-center text-sm text-gray-400 ${className ?? ''}`}>
      Reklam yeri
    </div>
  );
}
