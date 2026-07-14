'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertDialog, Button } from '@heroui/react';
import { deleteAccount } from '@/app/account/actions';
import { TrashIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" isPending={pending}>
      {({ isPending }) => (
        <>
          {isPending ? <Spinner size="sm" tone="current" /> : null}
          Hesabı sil
        </>
      )}
    </Button>
  );
}

export default function DeleteAccountDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button variant="danger" onPress={() => setIsOpen(true)}>
        <TrashIcon width={16} height={16} />
        Hesabı sil
      </Button>

      <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Header>
              <AlertDialog.Heading>Hesabı sil</AlertDialog.Heading>
            </AlertDialog.Header>
            <form action={deleteAccount}>
              <AlertDialog.Body>
                Hesabınız, bütün söhbətləriniz və mesajlarınız həmişəlik silinəcək. Bu əməliyyatı geri
                qaytarmaq mümkün deyil.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button type="button" variant="outline" onPress={() => setIsOpen(false)}>
                  Ləğv et
                </Button>
                <DeleteSubmitButton />
              </AlertDialog.Footer>
            </form>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}
