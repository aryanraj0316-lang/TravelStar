import type { Prisma } from '@prisma/client';

/**
 * The one rule for which notification rows the app's Notifications page
 * shows. The list (routes/notifications.ts) and the unread count behind the
 * bell dot and the app-icon badge (lib/push.ts) both use it, so a row can
 * never be counted as unread while the page has nothing to show for it —
 * which left the icon badge lit with no way to clear it. The app applies the
 * same rule to what it receives (src/lib/notification-visibility.ts).
 *
 * SOS alerts live in the Home/Chat banner, not this list; rows titled like
 * one are left over from before that.
 */
export const HIDDEN_FROM_LIST: Prisma.NotificationWhereInput[] = [
  { title: { contains: 'Emergency alert' } },
  { title: { contains: 'SOS' } },
];

/**
 * An app-wide broadcast sent before someone signed up is not news to them:
 * it shows in their list as already read and never counts toward their
 * badge. Counting every broadcast ever sent gave a brand-new account an
 * unread badge on day one.
 */
export function broadcastIsUnread(
  broadcast: { id: string; createdAt: Date },
  readIds: Set<string>,
  joinedAt: Date,
): boolean {
  return broadcast.createdAt >= joinedAt && !readIds.has(broadcast.id);
}
