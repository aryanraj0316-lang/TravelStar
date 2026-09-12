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
import CheckCheck from 'lucide-react-native/icons/check-check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Compass from 'lucide-react-native/icons/compass';
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
  const { setActiveRoomId, checkUnreadNotifications, isLoggedIn } = useApp();

  const notifQ = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: async () => (await apiService.getNotifications()) ?? [],
    enabled: isLoggedIn,
  });
  const { data: notifications = [], refetch: refetchNotifs, isRefetching } = notifQ;
  const notifState = sectionState(notifQ, notifQ.data != null);

  const unread = notifications.filter((n) => n.unread).length;

  // Unified chronological sort (newest first) with smart merge for join acceptance + group chat
  const sortedNotifications = useMemo(() => {
    // Identify trips with JOIN_ACCEPTED
    const joinAcceptedByTrip = new Map<string, AppNotification>();
    for (const n of notifications) {
      if (n.category === 'JOIN_ACCEPTED' && n.tripId) {
        joinAcceptedByTrip.set(n.tripId, n);
      }
    }

    const skippedChatAddedIds = new Set<string>();
    const companionChatMap = new Map<string, AppNotification>();
    for (const n of notifications) {
      if (n.category === 'CHAT_ADDED' && n.tripId && joinAcceptedByTrip.has(n.tripId)) {
        skippedChatAddedIds.add(n.id);
        companionChatMap.set(n.tripId, n);
      }
    }

    const mergedList: MergedNotificationItem[] = [];

    for (const n of notifications) {
      if (skippedChatAddedIds.has(n.id)) continue;

      if (n.category === 'JOIN_ACCEPTED' && n.tripId) {
        const companion = companionChatMap.get(n.tripId);
        const hasChatMention = n.content.toLowerCase().includes('group chat');
        const cleanTitle = n.title.replace(/[^\w\s-]/g, '').trim() || 'Join Request Accepted';
        const mergedContent = hasChatMention
          ? n.content
          : `${n.content.replace(/[!🎉]/g, '').trim()} and you have been added to the group chat.`;

        mergedList.push({
          ...n,
          title: cleanTitle,
          content: mergedContent,
          unread: n.unread || (companion?.unread ?? false),
          chatRoomId: n.chatRoomId || companion?.chatRoomId,
          secondaryNotificationId: companion?.id,
        });
        continue;
      }

      mergedList.push({
        ...n,
        title: n.title.replace(/[^\w\s-]/g, '').trim() || n.title,
      });
    }

    return mergedList.sort((a, b) => getTimestampMs(b) - getTimestampMs(a));
  }, [notifications]);

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

  const handleMarkAllRead = async () => {
    try {
      await apiService.markNotificationsRead();
      queryClient.setQueryData(queryKeys.notifications(), (prev: AppNotification[] = []) =>
        prev.map((n) => ({ ...n, unread: false })),
      );
      await refetchNotifs();
      checkUnreadNotifications();
      await syncBadgeCount();
    } catch (e) {
      logger.warn('[Notifications] Mark-all-read failed:', e);
      toast(errorToastMessage(e, t('notifications.couldNotMarkRead')), 'error');
    }
  };

  const handlePressNotification = async (n: MergedNotificationItem) => {
    if (n.unread) {
      try {
        await apiService.markNotificationRead(n.id);
        if (n.secondaryNotificationId) {
          void apiService.markNotificationRead(n.secondaryNotificationId);
        }
        queryClient.setQueryData(queryKeys.notifications(), (prev: AppNotification[] = []) =>
          prev.map((item) =>
            item.id === n.id || item.id === n.secondaryNotificationId
              ? { ...item, unread: false }
              : item,
          ),
        );
        checkUnreadNotifications();
        void syncBadgeCount();
      } catch (e) {
        logger.warn('[Notifications] Mark-read failed:', e);
      }
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

        {unread > 0 && (
          <TouchableOpacity
            style={st.markReadBtn}
            activeOpacity={0.75}
            onPress={handleMarkAllRead}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.markAllRead', 'Mark all read')}
          >
            <CheckCheck size={14} color="#2563EB" strokeWidth={2.5} />
            <Text style={st.markReadText}>{t('notifications.markAllRead', 'Mark read')}</Text>
          </TouchableOpacity>
        )}
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
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
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
