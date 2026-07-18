import { ShieldIcon } from '@/components/icons';
import { formatAzDateTime } from '@/lib/format/date';

interface SecurityQuickViewProps {
  lastSignInAt: string | null;
}

// Real data: lastSignInAt comes from Supabase auth's own user.last_sign_in_at
// (app/account/page.tsx reads it off supabase.auth.getUser()) — not a mock,
// even though the Stitch mockup's "Son giriş: 2 saat əvvəl" looked like a
// throwaway placeholder, this app already has the real value available.
// "Yoxla" anchors down to the real SecurityForms section (#security) below,
// where email/password can actually be changed.
export default function SecurityQuickView({ lastSignInAt }: SecurityQuickViewProps) {
  return (
    <div className="glass-card rounded-2xl border border-error/20 bg-error-container/10 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-error/15 text-error">
            <ShieldIcon />
          </div>
          <div>
            <h3 className="text-body-md font-bold text-on-surface">Təhlükəsizlik</h3>
            <p className="text-label-sm text-on-surface-variant">
              Son giriş: {lastSignInAt ? formatAzDateTime(lastSignInAt) : '—'}
            </p>
          </div>
        </div>
        <a
          href="#security"
          className="shrink-0 rounded-lg px-4 py-2 text-label-sm font-bold text-error transition-colors hover:bg-error/10"
        >
          Yoxla
        </a>
      </div>
    </div>
  );
}
