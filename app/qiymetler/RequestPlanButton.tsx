'use client';

import { useState, useTransition } from 'react';
import { Button, Input, Label, Modal, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { CheckIcon, SparkleIcon } from '@/components/icons';
import { submitPlanRequestAction } from './actions';

interface RequestPlanButtonProps {
  packageId: string;
  packageName: string;
  price: string;
  /** Prefilled when the visitor is signed in; empty for anonymous. */
  defaultEmail?: string | null;
}

// The interim purchase path: no payment provider is contracted yet, so instead
// of a dead "coming soon" label the visitor leaves an email and a phone number
// and the admin contacts them (the request lands in /admin/paketler, and the
// subscription is granted by hand).
//
// Only this branch is interactive — the rest of /qiymetler stays a server
// component, so the free card and the plan tables ship no JavaScript.
export default function RequestPlanButton({
  packageId,
  packageName,
  price,
  defaultEmail,
}: RequestPlanButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  // Honeypot. A human never sees it; a bot that fills every input it finds
  // trips it and the submission is silently discarded server-side.
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(open: boolean) {
    if (isPending) return;
    setIsOpen(open);
    if (!open) {
      // Reset on close so a second open is a clean form — but keep the email,
      // which is almost certainly still theirs.
      setError(null);
      setDone(false);
      setPhone('');
      setNote('');
    }
  }

  function handleSubmit() {
    if (isPending) return;
    setError(null);

    if (!email.trim()) {
      setError('E-poçt ünvanınızı yazın');
      return;
    }
    if (!phone.trim()) {
      setError('Telefon nömrənizi yazın');
      return;
    }

    startTransition(async () => {
      const result = await submitPlanRequestAction({
        packageId,
        email: email.trim(),
        phone: phone.trim(),
        note: note.trim() || undefined,
        website,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <>
      <Button
        variant="primary"
        size="md"
        className="w-full rounded-full"
        onPress={() => setIsOpen(true)}
      >
        Müraciət et
      </Button>

      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        isDismissable={!isPending}
        isKeyboardDismissDisabled={isPending}
        variant="blur"
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[440px]">
            {!isPending && <Modal.CloseTrigger />}

            <Modal.Header>
              <Modal.Icon className="bg-primary/15 text-primary">
                {done ? <CheckIcon width={18} height={18} /> : <SparkleIcon width={18} height={18} />}
              </Modal.Icon>
              <Modal.Heading>{done ? 'Müraciətiniz alındı' : 'Abunə üçün müraciət'}</Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              {done ? (
                <p className="text-body-md text-on-surface">
                  Təşəkkür edirik. Ən qısa zamanda göstərdiyiniz nömrə ilə əlaqə saxlayıb abunəni
                  aktivləşdirəcəyik.
                </p>
              ) : (
                <>
                  <p className="text-body-md text-on-surface">
                    <strong>{packageName}</strong> — {price}
                  </p>
                  <p className="mt-1 text-label-sm text-on-surface-variant">
                    Onlayn ödəniş hazırlanır. Əlaqə məlumatlarınızı qoyun, sizinlə əlaqə saxlayaq.
                  </p>

                  <div className="mt-4 space-y-3">
                    <TextField value={email} onChange={setEmail} isDisabled={isPending}>
                      <Label>E-poçt</Label>
                      <Input type="email" autoComplete="email" placeholder="ad@example.com" />
                    </TextField>

                    <TextField value={phone} onChange={setPhone} isDisabled={isPending}>
                      <Label>Telefon</Label>
                      <Input type="tel" autoComplete="tel" placeholder="+994 50 123 45 67" />
                    </TextField>

                    <TextField value={note} onChange={setNote} isDisabled={isPending}>
                      <Label>Qeyd (istəyə bağlı)</Label>
                      <Input placeholder="Əlavə etmək istədiyiniz bir şey" />
                    </TextField>

                    {/* Honeypot: off-screen rather than display:none, since some
                        bots skip hidden inputs but not positioned ones.
                        tabIndex/aria-hidden keep it away from real users. */}
                    <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
                      <label htmlFor="website-hp">Website</label>
                      <input
                        id="website-hp"
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="mt-3 rounded-2xl border border-error/30 bg-error/5 p-3 text-label-sm text-error">
                      {error}
                    </p>
                  )}
                </>
              )}
            </Modal.Body>

            <Modal.Footer className="gap-2">
              {done ? (
                <Button className="flex-1" variant="primary" onPress={() => handleOpenChange(false)}>
                  Bağla
                </Button>
              ) : (
                <>
                  <Button
                    className="flex-1"
                    variant="outline"
                    isDisabled={isPending}
                    onPress={() => handleOpenChange(false)}
                  >
                    Ləğv et
                  </Button>
                  <Button
                    className="flex-1"
                    variant="primary"
                    isPending={isPending}
                    isDisabled={isPending}
                    onPress={handleSubmit}
                  >
                    {({ isPending: pending }) => (
                      <>
                        {pending ? <Spinner size="sm" tone="current" /> : null}
                        Göndər
                      </>
                    )}
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
