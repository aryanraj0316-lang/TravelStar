import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import CheckCheck from 'lucide-react-native/icons/check-check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CreditCard from 'lucide-react-native/icons/credit-card';
import MessageSquare from 'lucide-react-native/icons/message-square';
import X from 'lucide-react-native/icons/x';

import { eventBus, type InAppNotif } from '@/services/event-bus';
import { useApp } from '@/store/AppContext';
import { C } from '@/theme/tokens';
import { apiService } from '@/services/api';
import { logger } from '@/lib/logger';
import { queryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import { syncBadgeCount } from '@/lib/push';
import type { AppNotification } from '@/types/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const InAppNotificationBanner: React.FC = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [notif, setNotif] = useState<InAppNotif | null>(null);

  const translateY = useRef(new Animated.Value(-140)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setActiveRoomId, checkUnreadNotifications, sosAlerts } = useApp();
  const router = useRouter();

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -140, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setNotif(null);
      translateX.setValue(0);
    });
  }, [translateY, translateX, opacity]);

  // PanResponder to make notification slideable & removable horizontally or vertically
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Capture gesture if horizontal swipe > 8px or vertical swipe up < -8px
        return Math.abs(gestureState.dx) > 8 || gestureState.dy < -8;
      },
      onPanResponderGrant: () => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
        if (gestureState.dy < 0) {
          translateY.setValue(gestureState.dy);
        }
        // Subtle opacity reduction as card is swiped far to left or right
        const progress = Math.min(Math.abs(gestureState.dx) / (SCREEN_WIDTH * 0.7), 1);
        opacity.setValue(1 - progress * 0.4);
      },
      onPanResponderRelease: (_, gestureState) => {
        const isSwipeRight = gestureState.dx > 60 || gestureState.vx > 0.4;
        const isSwipeLeft = gestureState.dx < -60 || gestureState.vx < -0.4;
        const isSwipeUp = gestureState.dy < -35 || gestureState.vy < -0.4;

        if (isSwipeRight) {
          if (dismissTimer.current) clearTimeout(dismissTimer.current);
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: SCREEN_WIDTH + 80,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setNotif(null);
            translateX.setValue(0);
            translateY.setValue(-140);
          });
        } else if (isSwipeLeft) {
          if (dismissTimer.current) clearTimeout(dismissTimer.current);
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: -(SCREEN_WIDTH + 80),
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setNotif(null);
            translateX.setValue(0);
            translateY.setValue(-140);
          });
        } else if (isSwipeUp) {
          if (dismissTimer.current) clearTimeout(dismissTimer.current);
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: -140,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setNotif(null);
            translateX.setValue(0);
          });
        } else {
          // Snap back to original position
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              bounciness: 6,
              useNativeDriver: true,
            }),
            Animated.spring(translateY, {
              toValue: 0,
              bounciness: 6,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start(() => {
            dismissTimer.current = setTimeout(dismiss, 5000);
          });
        }
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, bounciness: 6, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: 0, bounciness: 6, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start(() => {
          dismissTimer.current = setTimeout(dismiss, 5000);
        });
      },
    })
  ).current;

  useEffect(() => {
    const unsub = eventBus.on('inAppNotification', (data: InAppNotif) => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      translateX.setValue(0);
      translateY.setValue(-140);
      opacity.setValue(0);
      setNotif(data);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          bounciness: 6,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        dismissTimer.current = setTimeout(dismiss, 5000);
      });
    });

    const unsubDismiss = eventBus.on('dismissInAppNotification', (data?: { chatRoomId?: string }) => {
      setNotif((current) => {
        if (!current) return null;
        if (!data?.chatRoomId || current.chatRoomId === data.chatRoomId) {
          dismiss();
          return null;
        }
        return current;
      });
    });

    return () => {
      unsub();
      unsubDismiss();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [dismiss, translateX, translateY, opacity]);

  const handleTap = () => {
    if (!notif) return;

    // Every category here except CHAT_MESSAGE is backed by a real,
    // persisted Notification row (its `id` came from the server's
    // `notificationReceived` socket event, unlike CHAT_MESSAGE's banner,
    // which reuses the chat message's own id). Opening the thing this
    // banner points at is the read action — without dismissing the
    // underlying row here too, tapping the banner only slid it away
    // visually: the Notifications page still showed it as unread on next
    // load, and the header's unread dot never cleared, since nothing ever
    // told the server it had been seen.
    if (notif.category && notif.category !== 'CHAT_MESSAGE') {
      const notifId = notif.id;
      queryClient.setQueryData<AppNotification[]>(queryKeys.notifications(), (prev = []) =>
        prev.filter((n) => n.id !== notifId),
      );
      apiService
        .deleteNotification(notifId)
        .then(() => {
          checkUnreadNotifications();
          void syncBadgeCount();
        })
        .catch((e) => logger.warn('[InAppNotificationBanner] Failed to dismiss notification:', e));
    }

    if (notif.category === 'SOS' || /sos|emergency|आपातकालीन/i.test(notif.title || '') || /sos|emergency|आपातकालीन/i.test(notif.content || '')) {
      const matchedAlert = sosAlerts.find(
        (a) => a && (a.status === 'ACTIVE' || String(a.status).toUpperCase() === 'ACTIVE'),
      );
      if (matchedAlert) {
        router.push({
          pathname: '/map',
          params: {
            focusLat: String(matchedAlert.latitude),
            focusLng: String(matchedAlert.longitude),
            focusLabel: matchedAlert.message
              ? `🚨 SOS • ${matchedAlert.userName}: ${matchedAlert.message}`
              : `🚨 SOS • ${matchedAlert.userName} needs help here`,
            isSos: 'true',
            sosId: matchedAlert.id,
            t: String(Date.now()),
          },
        });
        dismiss();
        return;
      }
    }

    if (notif.category === 'PAYMENT_REQUIRED' && notif.joinRequestId) {
      router.push({
        pathname: '/trip-payment',
        params: { joinRequestId: notif.joinRequestId },
      });
    } else if (notif.category === 'TRIP_ENQUIRY') {
      router.push({
        pathname: '/group-organizer',
        params: {
          ...(notif.tripId ? { tripId: notif.tripId } : {}),
          tab: 'chat',
          subTab: 'chat',
        },
      });
    } else if (notif.chatRoomId) {
      setActiveRoomId(notif.chatRoomId);
      router.navigate('/chat');
    } else if (notif.tripId) {
      router.navigate('/bookings');
    }
    dismiss();
  };

  if (!notif) return null;

  const isChatMessage = notif.category === 'CHAT_MESSAGE';
  const isPayment = notif.category === 'PAYMENT_REQUIRED';
  const isEnquiry = notif.category === 'TRIP_ENQUIRY';

  const iconBg = isChatMessage || isEnquiry ? '#2563EB' : isPayment ? '#D97706' : C.green;
  const borderColor = isChatMessage || isEnquiry
    ? 'rgba(37, 99, 235, 0.4)'
    : isPayment
      ? 'rgba(217, 119, 6, 0.4)'
      : 'rgba(16, 185, 129, 0.35)';

  const Icon = isChatMessage || isEnquiry
    ? MessageSquare
    : isPayment
      ? CreditCard
      : notif.chatRoomId
        ? CheckCheck
        : Bell;

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top, 16) + 8 },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bannerWrap,
          {
            transform: [{ translateY }, { translateX }],
            opacity,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.banner, { borderColor }]}
          activeOpacity={0.92}
          onPress={handleTap}
          accessibilityRole="button"
          accessibilityLabel={notif.title}
          accessibilityHint={notif.chatRoomId ? t('notifications.tapToOpenGroupChat') : undefined}
        >
          {/* Left Icon Badge */}
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Icon size={19} color="#FFFFFF" strokeWidth={2.2} />
          </View>

          {/* Text Details */}
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {notif.title}
            </Text>
            <Text style={styles.content} numberOfLines={2}>
              {notif.content}
            </Text>
            {notif.chatRoomId && (
              <View style={styles.tapRow}>
                <Text
                  style={[
                    styles.tapHint,
                    (isChatMessage || isEnquiry) && { color: '#60A5FA' },
                    isPayment && { color: '#FBBF24' },
                  ]}
                >
                  {isChatMessage
                    ? t('chat.tapToOpen', 'Tap to open chat')
                    : isEnquiry
                      ? 'Tap to reply'
                      : t('notifications.tapToOpenGroupChat')}
                </Text>
                <ChevronRight
                  size={11}
                  color={isChatMessage || isEnquiry ? '#60A5FA' : isPayment ? '#FBBF24' : '#10B981'}
                />
              </View>
            )}
          </View>

          {/* Direct Dismiss Button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={dismiss}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.dismiss')}
          >
            <X size={15} color="rgba(255,255,255,0.6)" strokeWidth={2.2} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 12,
  },
  bannerWrap: {
    width: '100%',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 13,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  content: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  tapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 3,
  },
  tapHint: {
    color: '#10B981',
    fontSize: 11.5,
    fontWeight: '700',
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
