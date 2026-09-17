import { ScreenEmpty, ScreenError, ScreenLoading } from '@/components/ui';
import { errorToastMessage, toast } from '@/lib/feedback';
import { logger } from '@/lib/logger';
import { syncBadgeCount } from '@/lib/push';
import { queryKeys } from '@/lib/query-keys';
import { sectionState } from '@/lib/query-state';
import type { AppNotification } from '@/types/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Bell from 'lucide-react-native/icons/bell';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Compass from 'lucide-react-native/icons/compass';
import CreditCard from 'lucide-react-native/icons/credit-card';
import CheckCircle2 from 'lucide-react-native/icons/circle-check';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Plane from 'lucide-react-native/icons/plane';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Users from 'lucide-react-native/icons/users';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../services/api';
import { useApp } from '../store/AppContext';

interface NotificationConfig {
  icon: typeof Bell;
  iconColor: string;
  iconBg: string;
  accentColor: string;
  badgeLabel: string;
}

function getNotificationConfig(n: AppNotification): NotificationConfig {
  const cat = (n.category || '').toUpperCase();
  const type = (n.type || '').toUpperCase();

  if (cat === 'TRIP_ENQUIRY') {
    return {
      icon: MessageSquare,
      iconColor: '#2563EB',
      iconBg: '#EFF6FF',
      accentColor: '#3B82F6',
      badgeLabel: 'Enquiry',
    };
  }

  if (cat === 'JOIN_ACCEPTED' || cat === 'CHAT_ADDED' || n.chatRoomId) {
    return {
      icon: MessageSquare,
      iconColor: '#059669',
      iconBg: '#ECFDF5',
      accentColor: '#10B981',
      badgeLabel: 'Chat',
    };
  }

  if (cat === 'JOIN_REQUEST') {
    return {
      icon: Users,
      iconColor: '#7C3AED',
      iconBg: '#F5F3FF',
      accentColor: '#8B5CF6',
      badgeLabel: 'Request',
    };
  }

  if (type === 'HAZARD' || cat === 'HAZARD') {
    return {
      icon: ShieldAlert,
      iconColor: '#DC2626',
      iconBg: '#FEF2F2',
      accentColor: '#EF4444',
      badgeLabel: 'Hazard',
    };
  }

  if (type === 'TRIP' || n.tripId) {
    return {
      icon: Plane,
      iconColor: '#2563EB',
      iconBg: '#EFF6FF',
      accentColor: '#3B82F6',
      badgeLabel: 'Trip',
    };
  }

  if (type === 'SEASONAL') {
    return {
      icon: Compass,
      iconColor: '#D97706',
      iconBg: '#FFFBEB',
      accentColor: '#F59E0B',
      badgeLabel: 'Advisory',
    };
  }

  return {
    icon: Bell,
    iconColor: '#475569',
    iconBg: '#F1F5F9',
    accentColor: '#64748B',
    badgeLabel: 'Notification',
  };
}

function getTimestampMs(item: AppNotification): number {
  if (item.createdAt) {
    const t = new Date(item.createdAt).getTime();
    if (!Number.isNaN(t) && t > 0) return t;
  }
  if (item.time) {
    const t = new Date(item.time).getTime();
    if (!Number.isNaN(t) && t > 0) return t;
  }
  return 0;
}

function formatNotificationTime(timeStr?: string, createdAtStr?: string): string {
  if (timeStr && !timeStr.includes('T') && !timeStr.includes('-') && !timeStr.includes(':')) {
    return timeStr;
  }
  const raw = createdAtStr || timeStr;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return timeStr || '';

  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

type DateGroupKey = 'TODAY' | 'YESTERDAY' | 'EARLIER';

function getDateGroupKey(timestampMs: number): DateGroupKey {
  if (!timestampMs) return 'EARLIER';
  const d = new Date(timestampMs);
  const now = new Date();

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return 'TODAY';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'YESTERDAY';

  return 'EARLIER';
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: () => void;
}) {
  const config = getNotificationConfig(notification);
  const Icon = config.icon;
  const timeDisplay = formatNotificationTime(notification.time, notification.createdAt);

  return (
    <TouchableOpacity
      style={[st.row, notification.unread && st.rowUnread]}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={notification.title}
    >
      <View
        style={[
          st.rowAccent,
          { backgroundColor: notification.unread ? config.accentColor : 'transparent' },
        ]}
      />

      <View style={[st.rowIcon, { backgroundColor: config.iconBg }]}>
        <Icon size={17} color={config.iconColor} strokeWidth={2.2} />
      </View>

      <View style={st.rowBody}>
        <View style={st.rowMetaLine}>
          <View style={[st.categoryPill, { backgroundColor: config.iconBg }]}>
            <Text style={[st.categoryText, { color: config.iconColor }]}>
              {config.badgeLabel}
            </Text>
          </View>
          {timeDisplay ? <Text style={st.rowTime}>{timeDisplay}</Text> : null}
          {notification.unread && <View style={st.unreadDot} />}
        </View>

        <Text style={st.rowTitle} numberOfLines={2}>
          {notification.title}
        </Text>

        {notification.content ? (
          <Text style={st.rowContent} numberOfLines={3}>
            {notification.content}
          </Text>
        ) : null}

        {(notification.chatRoomId || notification.tripId) && (
          <View style={st.actionHint}>
            <Text style={[st.actionHintText, { color: config.accentColor }]}>
              {notification.chatRoomId
                ? notification.category === 'JOIN_ACCEPTED'
                  ? 'Open Group Chat'
                  : 'Open Chat'
                : 'View in Bookings'}
            </Text>
            <ChevronRight size={13} color={config.accentColor} strokeWidth={2.5} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

interface MergedNotificationItem extends AppNotification {
  secondaryNotificationId?: string;
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setActiveRoomId, checkUnreadNotifications, setHasUnreadNotification, isLoggedIn } = useApp();

  const notifQ = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: async () => (await apiService.getNotifications()) ?? [],
    enabled: isLoggedIn,
  });
  const { data: notifications = [], refetch: refetchNotifs, isRefetching } = notifQ;
  const notifState = sectionState(notifQ, notifQ.data != null);

  // Unified chronological sort (newest first) with smart merge and comprehensive deduplication
  const sortedNotifications = useMemo(() => {
    // 1. First pass: Deduplicate by exact ID and only retain active unread alerts
    const uniqueById = new Map<string, AppNotification>();
    for (const n of notifications) {
      if (!n || !n.id || n.unread === false) continue;
      // Route / weather alerts and personal SOS alerts belong on the home and chat tickers, not this list.
      if (
        n.type === 'HAZARD' ||
        n.category === 'HAZARD' ||
        (n.title && (n.title.toLowerCase().includes('emergency alert') || n.title.toLowerCase().includes('sos'))) ||
        (n.content && (n.content.toLowerCase().includes('emergency alert') || n.content.toLowerCase().includes('sos')))
      ) {
        continue;
      }
      if (!uniqueById.has(n.id)) {
        uniqueById.set(n.id, n);
      }
    }
    const notifs = Array.from(uniqueById.values());

    // 2. Identify trips with JOIN_ACCEPTED
    const joinAcceptedByTrip = new Map<string, AppNotification>();
    for (const n of notifs) {
      if (n.category === 'JOIN_ACCEPTED' && n.tripId) {
        joinAcceptedByTrip.set(n.tripId, n);
      }
    }

    const skippedChatAddedIds = new Set<string>();
    const companionChatMap = new Map<string, AppNotification>();
    for (const n of notifs) {
      if (n.category === 'CHAT_ADDED' && n.tripId && joinAcceptedByTrip.has(n.tripId)) {
        skippedChatAddedIds.add(n.id);
        companionChatMap.set(n.tripId, n);
      }
    }

    // 3. Merge companion notifications and normalize
    const rawMergedList: MergedNotificationItem[] = [];
    for (const n of notifs) {
      if (skippedChatAddedIds.has(n.id)) continue;

      if (n.category === 'JOIN_ACCEPTED' && n.tripId) {
        const companion = companionChatMap.get(n.tripId);
        const hasChatMention = n.content.toLowerCase().includes('group chat');
        const cleanTitle = n.title.replace(/[^\w\s-]/g, '').trim() || 'Join Request Accepted';
        const mergedContent = hasChatMention
          ? n.content
          : `${n.content.replace(/[!🎉]/g, '').trim()} and you have been added to the group chat.`;

        rawMergedList.push({
          ...n,
          title: cleanTitle,
          content: mergedContent,
          unread: n.unread || (companion?.unread ?? false),
          chatRoomId: n.chatRoomId || companion?.chatRoomId,
          secondaryNotificationId: companion?.id,
        });
        continue;
      }

      if (n.category === 'TRIP_ENQUIRY' || (n.title && n.title.toLowerCase().startsWith('new enquiry'))) {
        let tripName = '';
        if (n.title.includes('—')) {
          tripName = n.title.split('—').slice(1).join('—').trim();
        } else if (n.title.includes('-')) {
          tripName = n.title.split('-').slice(1).join('-').trim();
        } else if (n.title.includes(':')) {
          tripName = n.title.split(':').slice(1).join(':').trim();
        }

        const cleanTripName = tripName.replace(/[^\w\s-]/g, '').trim();
        const displayTitle = cleanTripName ? `New enquiry — ${cleanTripName}` : 'New enquiry';
        const displayContent = cleanTripName
          ? `New enquiry received for ${cleanTripName}.`
          : 'New enquiry received for this trip.';

        rawMergedList.push({
          ...n,
          title: displayTitle,
          content: displayContent,
        });
        continue;
      }

      rawMergedList.push({
        ...n,
        title: n.title.replace(/[^\w\s-]/g, '').trim() || n.title,
      });
    }

    // Sort newest first
    rawMergedList.sort((a, b) => getTimestampMs(b) - getTimestampMs(a));

    // 4. Semantic Deduplication: eliminate duplicate notifications for the same event
    const finalMergedList: MergedNotificationItem[] = [];
    const seenEventKeys = new Set<string>();

    for (const item of rawMergedList) {
      const cleanTitle = (item.title || '').trim().toLowerCase();
      const cleanContent = (item.content || '').trim().toLowerCase();

      // Key based on exact title and content
      const contentKey = `exact:${cleanTitle}|${cleanContent}`;

      // Key based on joinRequestId
      const joinReqKey = item.joinRequestId ? `joinReq:${item.joinRequestId}|${item.category || ''}` : null;

      // Key based on inquiry chatRoomId
      const inquiryKey = (item.category === 'TRIP_ENQUIRY' && item.chatRoomId)
        ? `inquiry:${item.chatRoomId}`
        : null;

      // Key based on trip + category (for join requests / approvals)
      const tripCategoryKey = (item.tripId && (item.category === 'JOIN_REQUEST' || item.category === 'JOIN_ACCEPTED' || item.category === 'PAYMENT_REQUIRED'))
        ? `tripCat:${item.tripId}|${item.category}|${cleanTitle}`
        : null;

      if (seenEventKeys.has(contentKey)) continue;
      if (joinReqKey && seenEventKeys.has(joinReqKey)) continue;
      if (inquiryKey && seenEventKeys.has(inquiryKey)) continue;
      if (tripCategoryKey && seenEventKeys.has(tripCategoryKey)) continue;

      seenEventKeys.add(contentKey);
      if (joinReqKey) seenEventKeys.add(joinReqKey);
      if (inquiryKey) seenEventKeys.add(inquiryKey);
      if (tripCategoryKey) seenEventKeys.add(tripCategoryKey);

      finalMergedList.push(item);
    }

    return finalMergedList;
  }, [notifications]);

  const unread = useMemo(() => sortedNotifications.filter((n) => n.unread).length, [sortedNotifications]);

  // Group notifications chronologically
  const groupedNotifications = useMemo(() => {
    const today: MergedNotificationItem[] = [];
    const yesterday: MergedNotificationItem[] = [];
    const earlier: MergedNotificationItem[] = [];

    for (const n of sortedNotifications) {
      const ms = getTimestampMs(n);
      const groupKey = getDateGroupKey(ms);
      if (groupKey === 'TODAY') today.push(n);
      else if (groupKey === 'YESTERDAY') yesterday.push(n);
      else earlier.push(n);
    }

    const groups: { key: string; title: string; items: MergedNotificationItem[] }[] = [];
    if (today.length > 0) {
      groups.push({ key: 'TODAY', title: t('notifications.today', 'Today'), items: today });
    }
    if (yesterday.length > 0) {
      groups.push({ key: 'YESTERDAY', title: t('notifications.yesterday', 'Yesterday'), items: yesterday });
    }
    if (earlier.length > 0) {
      groups.push({ key: 'EARLIER', title: t('notifications.earlier', 'Earlier'), items: earlier });
    }
    return groups;
  }, [sortedNotifications, t]);

  // Keep the home/profile notification dot in sync with actual displayed notifications
  React.useEffect(() => {
    if (sortedNotifications.length === 0) {
      setHasUnreadNotification(false);
    } else {
      const anyUnread = sortedNotifications.some((n) => n.unread !== false);
      setHasUnreadNotification(anyUnread);
    }
  }, [sortedNotifications, setHasUnreadNotification]);

  const handlePressNotification = async (n: MergedNotificationItem) => {
    // 1. Immediately remove this notification from state so it vanishes instantly
    queryClient.setQueryData(queryKeys.notifications(), (prev: AppNotification[] = []) =>
      prev.filter((item) => item.id !== n.id && item.id !== n.secondaryNotificationId),
    );

    // If no notifications remain, extinguish the notification dot immediately
    const remaining = (queryClient.getQueryData<AppNotification[]>(queryKeys.notifications()) || []).filter(
      (item) => item.id !== n.id && item.id !== n.secondaryNotificationId && item.unread !== false,
    );
    if (remaining.length === 0) {
      setHasUnreadNotification(false);
    }

    // 2. Dismiss from backend so it never reappears on refetch
    try {
      await apiService.deleteNotification(n.id);
      if (n.secondaryNotificationId) {
        void apiService.deleteNotification(n.secondaryNotificationId);
      }
      checkUnreadNotifications();
      void syncBadgeCount();
    } catch (e) {
      logger.warn('[Notifications] Dismiss failed:', e);
    }

    // joinRequestId is stored on the notification itself now, so this works
    // from the list on a cold start — not only while the original socket
    // payload happened to still be in memory.
    if (n.category === 'PAYMENT_REQUIRED' && n.joinRequestId) {
      router.push({
        pathname: '/trip-payment',
        params: { joinRequestId: n.joinRequestId },
      });
      return;
    }

    // A pre-join enquiry or join request belongs to the organizer portal's Chats &
    // Approvals tab, not the generic chat inbox — answering or reviewing
    // usually means approving or declining that traveller's join request or answering inquiries.
    if (n.category === 'TRIP_ENQUIRY' || n.category === 'JOIN_REQUEST') {
      router.push({
        pathname: '/group-organizer',
        params: {
          ...(n.tripId ? { tripId: n.tripId } : {}),
          tab: 'chat',
          subTab: n.category === 'JOIN_REQUEST' ? 'approvals' : 'chat',
        },
      });
      return;
    }

    if (n.chatRoomId) {
      setActiveRoomId(n.chatRoomId);
      router.navigate('/chat');
    } else if (n.tripId) {
      router.navigate('/bookings');
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={st.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── HEADER ── */}
      <View style={st.header}>
        <TouchableOpacity
          style={st.backBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.goBack', 'Go back')}
        >
          <ArrowLeft size={19} color="#0F172A" strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={st.headerCenter}>
          <Text style={st.headerTitle}>{t('notifications.title', 'Notifications')}</Text>
          {unread > 0 && (
            <View style={st.badge}>
              <Text style={st.badgeText}>{unread}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── CONTENT ── */}
      {!isLoggedIn ? (
        <ScreenEmpty
          title={t('notifications.signInTitle')}
          message={t('notifications.signInMessage')}
          actionLabel={t('notifications.signIn')}
          onAction={() => router.push('/auth')}
        />
      ) : notifState.kind === 'loading' ? (
        <ScreenLoading label={t('notifications.loadingNotifications')} />
      ) : notifState.kind === 'error' ? (
        <ScreenError
          title={t('notifications.couldNotLoad')}
          message={notifState.offline ? t('common.offlineMessage') : t('notifications.couldNotLoadMessage')}
          onRetry={() => void refetchNotifs()}
        />
      ) : notifications.length === 0 ? (
        <ScreenEmpty
          title={t('notifications.emptyTitle', 'Nothing new')}
          message={t('notifications.emptyMessage', "You're all caught up. Notifications will appear here.")}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.scroll}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetchNotifs()}
              tintColor="#2563EB"
            />
          }
        >
          {groupedNotifications.map((group) => (
            <View key={group.key} style={st.groupContainer}>
              <View style={st.groupHeader}>
                <Text style={st.groupTitle}>{group.title}</Text>
                <View style={st.groupLine} />
              </View>

              <View style={st.card}>
                {group.items.map((n, i) => (
                  <React.Fragment key={n.id}>
                    <NotificationRow
                      notification={n}
                      onPress={() => void handlePressNotification(n)}
                    />
                    {i < group.items.length - 1 && <View style={st.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  badge: {
    backgroundColor: '#2563EB',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Scroll
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 18,
  },

  // Group container
  groupContainer: {
    gap: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  groupLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },

  // Card container (groups rows)
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F1F5F9',
    marginLeft: 58,
  },

  // Notification row
  row: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    alignItems: 'flex-start',
  },
  rowUnread: {
    backgroundColor: '#F8FAFC',
  },
  rowAccent: {
    width: 3.5,
    alignSelf: 'stretch',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 12,
    marginRight: 0,
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 3,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  rowTime: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
    flex: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#2563EB',
    flexShrink: 0,
  },
  rowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  rowContent: {
    fontSize: 12.5,
    fontWeight: '400',
    color: '#475569',
    lineHeight: 17,
  },
  actionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  actionHintText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
