'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { DownloadIcon } from '@/components/icons';

// Not in the default TS DOM lib.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function InstallAppButton() {
  const deferredEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showAndroidModal, setShowAndroidModal] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    if (isIosSafari()) {
      // Syncing UA/standalone-mode detection (not derivable at render time), same
      // pattern as ThemeToggle's no-FOUC DOM sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsIOS(true);
      setVisible(true);
      return;
    }

    // Non-iOS: show the button immediately rather than waiting for
    // beforeinstallprompt (Chrome's engagement heuristic means it may never
    // fire, or only fires after a delay) — click falls back to a manual-
    // instructions modal unless/until the real event arrives.
    setVisible(true);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredEventRef.current = event as BeforeInstallPromptEvent;
    }

    function handleAppInstalled() {
      deferredEventRef.current = null;
      setVisible(false);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function handleClick() {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    const deferredEvent = deferredEventRef.current;
    if (!deferredEvent) {
      setShowAndroidModal(true);
      return;
    }

    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    // beforeinstallprompt fires once per event instance — always spent after use.
    deferredEventRef.current = null;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={buttonVariants({ variant: 'secondary', size: 'md' }) + ' w-full justify-center gap-2'}
      >
        <DownloadIcon className="shrink-0" />
        Tətbiqi quraşdır
      </button>

      <Modal.Backdrop isOpen={showIOSModal} onOpenChange={setShowIOSModal}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[380px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Ana ekrana əlavə et</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-on-surface-variant">
                Safari-də Paylaş düyməsinə basın, sonra &quot;Ana ekrana əlavə et&quot; seçin.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button className="w-full" slot="close" variant="secondary">
                Bağla
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop isOpen={showAndroidModal} onOpenChange={setShowAndroidModal}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[380px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Ana ekrana əlavə et</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-on-surface-variant">
                Brauzerin yuxarı sağındakı menyu (⋮) düyməsinə basın, sonra &quot;Tətbiqi
                quraşdır&quot; və ya &quot;Ana ekrana əlavə et&quot; seçin.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button className="w-full" slot="close" variant="secondary">
                Bağla
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
