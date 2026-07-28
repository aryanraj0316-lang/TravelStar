import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CheckCheck, ChevronRight, X } from 'lucide-react-native';
import { eventBus } from '@/services/event-bus';
import { useApp } from '@/store/AppContext';

interface InAppNotif {
  id: string;
  title: string;
  content: string;
  chatRoomId?: string;
  tripId?: string;
  category?: string;
}

export const InAppNotificationBanner: React.FC = () => {
  const [notif, setNotif] = useState<InAppNotif | null>(null);
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setActiveRoomId } = useApp();

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
      eventBus.emit('switchTab', 'chat');
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
              <Text style={styles.tapHint}>Tap to open group chat</Text>
              <ChevronRight size={11} color="#10B981" />
            </View>
          )}
        </View>

        {/* Dismiss */}
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 16,
    paddingTop: 56, // below status bar / safe area
    alignItems: 'flex-end',
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
    width: 320,
    maxWidth: '95%',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
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
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
});
