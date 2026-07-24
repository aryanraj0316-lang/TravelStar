import { Tabs } from 'expo-router';
import {
  Home,
  Map,
  MessageSquare,
  PlusCircle,
  Search,
  User,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useApp } from '@/store/AppContext';

const TAB_ICONS: Record<string, typeof Home> = {
  index: Home,
  search: Search,
  create: PlusCircle,
  map: Map,
  chat: MessageSquare,
  profile: User,
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  search: 'Search',
  create: 'Create',
  map: 'Map',
  chat: 'Chat',
  profile: 'Profile',
};

// ─── Animated Tab Item ──────────────────────────────────────────────
function AnimatedTabButton({
  routeName,
  isFocused,
  onPress,
  onLongPress,
  isDark,
}: {
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  isDark: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isFocused ? 1 : 0,
      friction: 8,
      tension: 180,
      useNativeDriver: true,
    }).start();
  }, [isFocused]);

  const Icon = TAB_ICONS[routeName] || Home;
  const label = TAB_LABELS[routeName] || routeName;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
      style={styles.tabButton}
    >
      <Animated.View
        style={{
          transform: [
            { scale: scaleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) },
          ],
        }}
      >
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
            <Icon size={20} color={isDark ? '#94A3B8' : '#64748B'} strokeWidth={1.8} />
            <Text style={[styles.inactiveTabLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {label}
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Custom Floating Glass Capsule Dock ──────────────────────────────
function CustomTabBar({ state, descriptors, navigation }: any) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark' || true;
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH } = Dimensions.get('window');

  const activeIndex = state.index;
  const currentRouteName = state.routes[activeIndex]?.name;
  const prevIndexRef = useRef(activeIndex);
  const [dockWidth, setDockWidth] = useState(0);
  const tabCenterXRef = useRef<Record<number, number>>({});

  // ── Animations ──────────────────────────────────────────────────────
  // Dock: slides from 0 to -(dockWidth + margin) to go fully off-screen
  const dockSlideAnim = useRef(new Animated.Value(0)).current;
  // Peek icon: starts fully off-screen left (-44), slides to -22 (half visible)
  const peekSlideAnim = useRef(new Animated.Value(-50)).current;
  const peekOpacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    prevIndexRef.current = activeIndex;
  }, [activeIndex]);

  const { activeRoomId, navbarHidden, setNavbarHidden } = useApp();

  // ── Core slide in/out logic ──────────────────────────────────────────
  useEffect(() => {
    if (currentRouteName !== 'index') return;

    const dockW = dockWidth > 0 ? dockWidth : SCREEN_WIDTH - 20;

    if (navbarHidden) {
      // 1. Slide the full dock completely off-screen to the left
      Animated.spring(dockSlideAnim, {
        toValue: -(dockW + 30),
        friction: 7,
        tension: 55,
        useNativeDriver: true,
      }).start();

      // 2. Animate the extracted active-icon peeking from the left edge
      //    peekSlideAnim: -50 (hidden) → -22 (half visible)
      Animated.parallel([
        Animated.spring(peekSlideAnim, {
          toValue: -22,
          friction: 7,
          tension: 55,
          useNativeDriver: true,
        }),
        Animated.timing(peekOpacityAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // 1. Slide the full dock back into view
      Animated.spring(dockSlideAnim, {
        toValue: 0,
        friction: 7,
        tension: 55,
        useNativeDriver: true,
      }).start();

      // 2. Fade & slide the peeking icon back off-screen
      Animated.parallel([
        Animated.spring(peekSlideAnim, {
          toValue: -50,
          friction: 7,
          tension: 55,
          useNativeDriver: true,
        }),
        Animated.timing(peekOpacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [navbarHidden, dockWidth]);

  // ── Reset when leaving home tab ──────────────────────────────────────
  useEffect(() => {
    if (currentRouteName !== 'index') {
      setNavbarHidden(false);
      dockSlideAnim.setValue(0);
      peekSlideAnim.setValue(-50);
      peekOpacityAnim.setValue(0);
    }
  }, [currentRouteName]);

  // ── Hide entirely when in chat room or stories ───────────────────────
  // ── Hide entirely when in chat room, stories, monsoon advisory, or destination details ──
  if (
    (currentRouteName === 'chat' && activeRoomId !== null) ||
    currentRouteName === 'stories' ||
    currentRouteName === 'destination-details' ||
    currentRouteName === 'monsoon-advisory'
  ) {
    return <View style={{ height: 0 }} />;
  }

  const visibleRoutes = state.routes.filter(
    (r: any) => ['index', 'search', 'create', 'map', 'chat', 'profile'].includes(r.name)
  );

  const handleTabPress = (routeKey: string, routeName: string, index: number) => {
    const isFocused = activeIndex === index;
    if (!isFocused) {
      prevIndexRef.current = index;
    }
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  // Active icon for the peek element
  const ActiveIcon = TAB_ICONS[currentRouteName] || Home;
  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <>
      {/* ── Peeking floating icon: extracted from navbar, half-visible from left edge ── */}
      <Animated.View
        style={[
          styles.peekingWrap,
          {
            bottom: bottomOffset + 6, // vertically match the dock
            opacity: peekOpacityAnim,
            transform: [{ translateX: peekSlideAnim }],
          },
        ]}
        pointerEvents={navbarHidden ? 'auto' : 'none'}
      >
        <TouchableOpacity
          onPress={() => setNavbarHidden(false)}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#0044CC', '#0066FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.peekPill}
          >
            <ActiveIcon size={20} color="#FFFFFF" strokeWidth={2.4} />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Full dock ─────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.floatingDockWrap,
          {
            bottom: bottomOffset,
            transform: [{ translateX: dockSlideAnim }],
          },
        ]}
        onLayout={(e) => setDockWidth(e.nativeEvent.layout.width)}
      >
        <LinearGradient
          colors={isDark ? ['#0C1020', '#050710'] : ['#FFFFFF', '#F1F5F9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.tabBarContainer,
            {
              borderColor: isDark ? '#1A1D30' : '#CBD5E1',
            },
          ]}
        >
          {visibleRoutes.map((route: any, idx: number) => {
            const isFocused = activeIndex === idx;

            return (
              <View
                key={route.key}
                style={{ flex: 1, alignItems: 'center' }}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  tabCenterXRef.current[idx] = x + width / 2 - 21;
                }}
              >
                <AnimatedTabButton
                  routeName={route.name}
                  isFocused={isFocused}
                  onPress={() => handleTabPress(route.key, route.name, idx)}
                  onLongPress={() => {
                    navigation.emit({
                      type: 'tabLongPress',
                      target: route.key,
                    });
                  }}
                  isDark={isDark}
                />
              </View>
            );
          })}
        </LinearGradient>
      </Animated.View>
    </>
  );
}

// ─── Main App Tabs Navigator ────────────────────────────────────────
export default function AppTabs() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="map" options={{ title: 'Map' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────
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
    shadowColor: '#0066FF',
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
    shadowColor: '#0066FF',
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
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  // ── Peeking icon ─────────────────────────────────────────────────
  peekingWrap: {
    position: 'absolute',
    left: 0,       // anchored to left edge of screen
    zIndex: 100,
  },
  peekPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
});
