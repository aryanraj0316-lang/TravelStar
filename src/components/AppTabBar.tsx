// Custom bottom tab bar for the real expo-router Tabs navigator (see
// src/app/(tabs)/_layout.tsx). Visually this is the same floating glass
// capsule dock the app always had — only the data source changed: it now
// reads real navigation state (`state`/`navigation` from React Navigation)
// instead of the ad-hoc TabContext + horizontal-ScrollView pager that used
// to live in the deleted src/components/app-tabs.tsx (REMEDIATION.md §7.1).
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import Home from 'lucide-react-native/icons/house';
import Map from 'lucide-react-native/icons/map';
import MessageSquare from 'lucide-react-native/icons/message-square';
import PlusCircle from 'lucide-react-native/icons/circle-plus';
import Search from 'lucide-react-native/icons/search';
import User from 'lucide-react-native/icons/user';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { eventBus } from '@/services/event-bus';
import { useApp } from '@/store/AppContext';
import { C } from '@/theme/tokens';

// Derived from <Tabs>'s own declared `tabBar` prop rather than importing
// BottomTabBarProps from an internal expo-router path — expo-router vendors
// its own bottom-tabs implementation (no standalone @react-navigation/
// bottom-tabs package is installed), so this stays correct across versions
// without depending on that internal module layout.
type TabBarRenderer = NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>;
type AppTabBarProps = Parameters<TabBarRenderer>[0];

const TAB_ICONS: Record<string, typeof Home> = {
  index: Home,
  search: Search,
  create: PlusCircle,
  map: Map,
  chat: MessageSquare,
  profile: User,
};

const TAB_LABEL_KEYS: Record<string, string> = {
  index: 'nav.home',
  search: 'nav.search',
  create: 'nav.create',
  map: 'nav.map',
  chat: 'nav.chat',
  profile: 'nav.profile',
};

import Plus from 'lucide-react-native/icons/plus';

const AnimatedTabButton = React.memo(function AnimatedTabButton({
  routeName,
  isFocused,
  onPress,
  showDot,
}: {
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
  isDark?: boolean;
  showDot?: boolean;
}) {
  const { t } = useTranslation();
  const [scaleAnim] = useState(() => new Animated.Value(isFocused ? 1 : 0));

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 120,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isFocused, scaleAnim]);

  const scale = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1.04],
  });

  const Icon = TAB_ICONS[routeName] || Home;
  const labelKey = TAB_LABEL_KEYS[routeName];
  const label = labelKey ? t(labelKey) : routeName;

  // Center button special treatment (Image 1 purple circular button)
  if (routeName === 'create') {
    return (
      <Pressable
        onPress={onPress}
        style={styles.centerTabButton}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: isFocused }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <View style={styles.centerActionCircle}>
            <Plus size={24} color="#FFFFFF" strokeWidth={2.8} />
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {isFocused ? (
          <View style={styles.activePillCapsule}>
            <Icon size={20} color="#2563EB" strokeWidth={2.4} />
            <Text style={styles.activeTabLabel}>{label}</Text>
          </View>
        ) : (
          <View style={styles.inactiveTabBox}>
            <View style={{ position: 'relative' }}>
              <Icon size={20} color="#64748B" strokeWidth={1.8} />
              {showDot && <View style={styles.tabDot} />}
            </View>
            <Text style={styles.inactiveTabLabel}>
              {label}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

export function AppTabBar({ state, navigation }: AppTabBarProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || true;
  const insets = useSafeAreaInsets();

  const router = useRouter();
  const {
    activeRoomId,
    navbarHidden,
    setNavbarHidden,
    pendingRequestsCount,
    hasUnreadChat,
    isLoggedIn,
  } = useApp();

  const currentRouteName = state.routes[state.index].name;

  // Every non-tab full-screen route (stories, destination-details, auth,
  // support, about, monsoon-advisory, ...) lives OUTSIDE this Tabs
  // navigator now, in the root Stack — so this bar simply never renders for
  // them and doesn't need to name them one by one (REMEDIATION.md §7.2: the
  // old version listed six route names that could never actually occur
  // here as "hide the bar" conditions). Only two real cases remain: an open
  // chat room, and an explicit navbarHidden signal from a tab screen itself.
  const shouldHideTabBar =
    (currentRouteName === 'chat' && activeRoomId !== null) ||
    (currentRouteName !== 'index' && navbarHidden);

  const [dockTranslateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(dockTranslateY, {
      toValue: shouldHideTabBar ? 150 : 0,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [shouldHideTabBar, dockTranslateY]);

  useEffect(() => {
    const unsub = eventBus.on('toggleNavbar', (hidden: boolean) => {
      Animated.timing(dockTranslateY, {
        toValue: hidden ? 150 : 0,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
    return unsub;
  }, [dockTranslateY]);

  // AppContext tracks the active tab name (for "is the chat tab currently
  // open" unread-dot logic) via this event — see AppContext.tsx's
  // activeTabNameRef. Kept as an event rather than prop-drilling since the
  // context provider sits above the navigator and can't read navigation
  // state directly.
  useEffect(() => {
    eventBus.emit('tabChanged', currentRouteName);
  }, [currentRouteName]);

  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <Animated.View
      style={[
        styles.floatingDockWrap,
        { bottom: bottomOffset },
        { transform: [{ translateY: dockTranslateY }] },
        shouldHideTabBar ? { display: 'none' } : undefined,
      ]}
    >
      <View
        style={styles.tabBarContainer}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            if (route.name === 'profile' && !isLoggedIn) {
              router.push('/auth?mode=SIGNUP');
              return;
            }

            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
            setNavbarHidden(false);
          };

          return (
            <View key={route.key} style={{ flex: 1, alignItems: 'center' }}>
              <AnimatedTabButton
                routeName={route.name}
                isFocused={isFocused}
                onPress={onPress}
                isDark={isDark}
                showDot={
                  (route.name === 'create' && pendingRequestsCount > 0) ||
                  (route.name === 'chat' && hasUnreadChat)
                }
              />
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floatingDockWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 99,
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  centerActionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  activePillCapsule: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  activeTabLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 2,
    textAlign: 'center',
  },
  inactiveTabBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  inactiveTabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  tabDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.red,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
