import { eventBus } from '@/services/event-bus';
import { useApp } from '@/store/AppContext';
import { useRouter } from 'expo-router';
import { CheckCheck, ChevronRight, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { C } from '@/theme/tokens';

interface InAppNotif {
  id: string;
  title: string;
  content: string;
  chatRoomId?: string;
  tripId?: string;
  category?: string;
}

export const InAppNotificationBanner: React.FC = () => {
  const { t } = useTranslation();
  const [notif, setNotif] = useState<InAppNotif | null>(null);
  const translateY = useState(() => new Animated.Value(-100))[0];
  const opacity = useState(() => new Animated.Value(0))[0];
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setActiveRoomId } = useApp();
  const router = useRouter();

  const dismiss = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setNotif(null));
  };

  const show = (data: InAppNotif) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    translateY.setValue(-120);
    opacity.setValue(0);
    setNotif(data);

    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start(() => {
      dismissTimer.current = setTimeout(dismiss, 5000);
    });
  };

  useEffect(() => {
    const unsub = eventBus.on('inAppNotification', (data: InAppNotif) => {
      show(data);
    });
    return () => {
      unsub();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const handleTap = () => {
    if (notif?.chatRoomId) {
      setActiveRoomId(notif.chatRoomId);
      router.navigate('/chat');
    }
    dismiss();
  };

  if (!notif) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }], opacity },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.banner}
        activeOpacity={0.92}
        onPress={handleTap}
        accessibilityRole="button"
        accessibilityLabel={notif.title}
        accessibilityHint={notif.chatRoomId ? t('notifications.tapToOpenGroupChat') : undefined}
      >
        {/* Left icon */}
        <View style={styles.iconWrap}>
          <CheckCheck size={20} color="#fff" />
        </View>

        {/* Text body */}
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>{notif.title}</Text>
          <Text style={styles.content} numberOfLines={2}>{notif.content}</Text>
          {notif.chatRoomId && (
            <View style={styles.tapRow}>
              <Text style={styles.tapHint}>{t('notifications.tapToOpenGroupChat')}</Text>
              <ChevronRight size={11} color="#10B981" />
            </View>
          )}
        </View>

        {/* Dismiss */}
        <TouchableOpacity
          onPress={dismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
        >
          <X size={16} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </TouchableOpacity>
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
    paddingTop: 52, // below status bar / safe area
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131A30',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  content: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  tapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 3,
  },
  tapHint: {
    color: C.green,
    fontSize: 12,
    fontWeight: '700',
  },
});
