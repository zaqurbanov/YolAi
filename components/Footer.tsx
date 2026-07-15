import Link from 'next/link';
import { HelpIcon, ArrowRightIcon } from '@/components/icons';

export default function Footer() {
  return (
    <footer className="border-t border-outline-variant/40 px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <span className="font-display text-base font-bold text-on-surface">Yol Hərəkəti QA</span>
          <span className="mono-label text-on-surface-variant">
            &copy; {new Date().getFullYear()} Hüquqi AI köməkçi. Bütün hüquqlar qorunur.
          </span>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/privacy" className="text-sm text-on-surface-variant hover:text-primary hover:underline">
            Məxfilik Siyasəti
          </Link>
          <Link href="/terms" className="text-sm text-on-surface-variant hover:text-primary hover:underline">
            İstifadə Şərtləri
          </Link>

          <div className="flex items-center gap-3">
            <a
              href="#top"
              aria-label="Yuxarı qayıt"
              className="glass-card flex size-10 items-center justify-center rounded-full border-0 text-on-surface-variant transition-colors hover:text-primary"
            >
              <ArrowRightIcon className="-rotate-90" />
            </a>
            <a
              href="mailto:qurbanovzaur078@gmail.com"
              aria-label="Dəstək"
              className="glass-card flex size-10 items-center justify-center rounded-full border-0 text-on-surface-variant transition-colors hover:text-primary"
            >
              <HelpIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
