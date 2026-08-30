// Custom bottom tab bar for the real expo-router Tabs navigator (see
// src/app/(tabs)/_layout.tsx). Visually this is the same floating glass
// capsule dock the app always had — only the data source changed: it now
// reads real navigation state (`state`/`navigation` from React Navigation)
// instead of the ad-hoc TabContext + horizontal-ScrollView pager that used
// to live in the deleted src/components/app-tabs.tsx (REMEDIATION.md §7.1).
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import {
  Home,
  Map,
  MessageSquare,
  PlusCircle,
  Search,
  User,
} from 'lucide-react-native';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

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

const AnimatedTabButton = React.memo(function AnimatedTabButton({
  routeName,
  isFocused,
  onPress,
  isDark,
  showDot,
}: {
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
  isDark: boolean;
  showDot?: boolean;
}) {
  const { t } = useTranslation();
  const scale = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    scale.value = withTiming(isFocused ? 1 : 0, {
      duration: 120,
      easing: Easing.out(Easing.ease),
    });
  }, [isFocused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * 0.12 + 0.94 }],
  }));

  const Icon = TAB_ICONS[routeName] || Home;
  const labelKey = TAB_LABEL_KEYS[routeName];
  const label = labelKey ? t(labelKey) : routeName;

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
    >
      <Animated.View style={animatedStyle}>
        {isFocused ? (
          <LinearGradient
            colors={['#0044CC', '#0066FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.activePillCapsule}
          >
            <Icon size={20} color="#FFFFFF" strokeWidth={2.4} />
          </LinearGradient>
        ) : (
          <View style={styles.inactiveTabBox}>
            <View style={{ position: 'relative' }}>
              <Icon size={20} color={isDark ? '#94A3B8' : '#7E8494'} strokeWidth={1.8} />
              {showDot && <View style={styles.tabDot} />}
            </View>
            <Text style={[styles.inactiveTabLabel, { color: isDark ? '#94A3B8' : '#7E8494' }]}>
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

  const {
    activeRoomId,
    navbarHidden,
    setNavbarHidden,
    pendingRequestsCount,
    hasUnreadChat,
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

  const dockTranslateY = useSharedValue(0);

  useEffect(() => {
    dockTranslateY.value = withTiming(shouldHideTabBar ? 150 : 0, {
      duration: 150,
      easing: Easing.out(Easing.ease),
    });
  }, [shouldHideTabBar, dockTranslateY]);

  useEffect(() => {
    const unsub = eventBus.on('toggleNavbar', (hidden: boolean) => {
      dockTranslateY.value = withTiming(hidden ? 150 : 0, {
        duration: 150,
        easing: Easing.out(Easing.ease),
      });
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

  const dockAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dockTranslateY.value }],
    display: shouldHideTabBar ? 'none' : 'flex',
  }));

  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <Animated.View style={[styles.floatingDockWrap, { bottom: bottomOffset }, dockAnimatedStyle]}>
      <LinearGradient
        colors={isDark ? ['#0C1020', '#050710'] : ['#FFFFFF', '#F1F5F9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.tabBarContainer, { borderColor: isDark ? '#1A1D30' : '#CBD5E1' }]}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
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
      </LinearGradient>
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
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 30,
    borderWidth: 1.5,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 8,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePillCapsule: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  inactiveTabBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  inactiveTabLabel: {
    fontSize: 12,
    fontWeight: '600',
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
    borderColor: '#0C1020',
  },
});
