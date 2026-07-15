'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@heroui/react';
import { BellIcon } from '@/components/icons';
import { formatAzDateTime } from '@/lib/format/date';
import { markNotificationReadAction } from '@/app/notifications/actions';
import type { NotificationRow } from '@/lib/notifications/notifications';

interface NotificationBellProps {
  initialUnreadCount: number;
  initialNotifications: NotificationRow[];
}

// Modal (not Popover) to match components/CoinBadge.tsx's click-to-open-modal
// pattern for the other navbar icon — consistency across the two navbar
// info affordances, per explicit request.
export default function NotificationBell({
  initialUnreadCount,
  initialNotifications,
}: NotificationBellProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState(initialNotifications);

  async function handleSelect(notification: NotificationRow) {
    if (!notification.read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      await markNotificationReadAction(notification.id);
      router.refresh();
    }
    if (notification.link) {
      setIsModalOpen(false);
      router.push(notification.link);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        aria-label="Bildirişlər"
        className="glass-card relative flex size-9 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-tertiary/60"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="mono-label absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10px] text-on-error">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <Modal.Backdrop isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[380px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Bildirişlər</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-96 overflow-y-auto p-0">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-on-surface-variant">
                  Hələ bildiriş yoxdur
                </p>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void handleSelect(n)}
                        className={`block w-full px-4 py-3 text-left text-sm transition-colors hover:bg-surface-tertiary/40 ${
                          n.read ? 'text-on-surface-variant' : 'text-on-surface'
                        }`}
                      >
                        <p>{n.message}</p>
                        <p className="mono-label mt-1 text-xs text-on-surface-variant">
                          {formatAzDateTime(n.createdAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
