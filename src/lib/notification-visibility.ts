import type { AppNotification } from '@/types/api';

/**
 * Notifications the Notifications page leaves out: SOS alerts, which live in
 * the Home/Chat banner instead. This is the same rule the server applies to
 * the list and to the unread count behind the bell dot and the app-icon badge
 * (backend/src/lib/notification-visibility.ts). It used to hide anything that
 * merely mentioned "emergency" or "sos" anywhere in its text — while the
 * server still counted those as unread — so the icon badge stayed lit for
 * notifications nobody could see, and so could never mark read.
 */
export function isHiddenFromNotificationList(
  n: Pick<AppNotification, 'title'> & { category?: string | null; type?: string | null },
): boolean {
  if (n.category === 'SOS' || n.type === 'SOS') return true;
  const title = n.title ?? '';
  return title.includes('Emergency alert') || title.includes('SOS');
}
