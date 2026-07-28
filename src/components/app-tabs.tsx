import { LinearGradient } from 'expo-linear-gradient';
import {
  Home,
  Map,
  MessageSquare,
  PlusCircle,
  Search,
  User,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { eventBus } from '@/services/event-bus';
import { useApp } from '@/store/AppContext';

import HomeScreen from '../screens/home-screen';
import SearchScreen from '../app/search';
import CreateTripScreen from '../app/create';
import MapScreen from '../app/map';
import ChatScreen from '../app/chat';
import ProfileScreen from '../app/profile';
import { InAppNotificationBanner } from './InAppNotificationBanner';

const TabContext = React.createContext<{
  activeTabName: string;
  setActiveTabName: (name: string) => void;
}>({ activeTabName: 'index', setActiveTabName: () => {} });

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
  const scale = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    scale.value = withTiming(isFocused ? 1 : 0, {
      duration: 120,
      easing: Easing.out(Easing.ease),
    });
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value * 0.12 + 0.94 },
      ],
    };
  });

  const Icon = TAB_ICONS[routeName] || Home;
  const label = TAB_LABELS[routeName] || routeName;

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButton}
    >
      <Animated.View style={animatedStyle}>
        {isFocused ? (
          <LinearGradient
            colors={['#0044CC', '#0066FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.activePillCapsule}
          >
            <View style={{ position: 'relative' }}>
              <Icon size={20} color="#FFFFFF" strokeWidth={2.4} />
              {showDot && !isFocused && <View style={styles.tabDot} />}
            </View>
          </LinearGradient>
        ) : (
          <View style={styles.inactiveTabBox}>
            <View style={{ position: 'relative' }}>
              <Icon size={20} color={isDark ? '#94A3B8' : '#64748B'} strokeWidth={1.8} />
              {showDot && !isFocused && <View style={styles.tabDot} />}
            </View>
            <Text style={[styles.inactiveTabLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {label}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

// ─── Custom Floating Glass Capsule Dock ──────────────────────────────
const CustomTabBar = React.memo(function CustomTabBar() {
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

  const { activeTabName, setActiveTabName } = React.useContext(TabContext);

  const currentRouteName = activeTabName;
  const [dockWidth, setDockWidth] = useState(0);
  const tabCenterXRef = useRef<Record<number, number>>({});

  const shouldHideTabBar =
    (currentRouteName === 'chat' && activeRoomId !== null) ||
    currentRouteName === 'stories' ||
    currentRouteName === 'destination-details' ||
    currentRouteName === 'monsoon-advisory' ||
    currentRouteName === 'auth' ||
    currentRouteName === 'map' ||
    currentRouteName === 'support' ||
    currentRouteName === 'about' ||
    (currentRouteName !== 'index' && navbarHidden);

  const dockTranslateY = useSharedValue(0);

  useEffect(() => {
    dockTranslateY.value = withTiming(shouldHideTabBar ? 150 : 0, {
      duration: 150,
      easing: Easing.out(Easing.ease),
    });
  }, [shouldHideTabBar]);

  useEffect(() => {
    const unsub = eventBus.on('toggleNavbar', (hidden: boolean) => {
      dockTranslateY.value = withTiming(hidden ? 150 : 0, {
        duration: 150,
        easing: Easing.out(Easing.ease),
      });
    });
    return unsub;
  }, [dockTranslateY]);

  const dockAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: dockTranslateY.value }],
      display: shouldHideTabBar ? 'none' : 'flex',
    };
  });

  const handleTabPress = useCallback((routeName: string) => {
    setActiveTabName(routeName);
    setNavbarHidden(false);
  }, [setActiveTabName, setNavbarHidden]);

  const visibleRoutes = [
    { name: 'index', key: 'index-route' },
    { name: 'search', key: 'search-route' },
    { name: 'create', key: 'create-route' },
    { name: 'map', key: 'map-route' },
    { name: 'chat', key: 'chat-route' },
    { name: 'profile', key: 'profile-route' },
  ];

  const bottomOffset = Math.max(insets.bottom, 12);

  return (
    <Animated.View
      style={[
        styles.floatingDockWrap,
        { bottom: bottomOffset },
        dockAnimatedStyle
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
        {visibleRoutes.map((route, idx) => {
          const isFocused = currentRouteName === route.name;

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
                onPress={() => handleTabPress(route.name)}
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
});

const VISIBLE_ROUTES = [
  { name: 'index', index: 0 },
  { name: 'search', index: 1 },
  { name: 'create', index: 2 },
  { name: 'map', index: 3 },
  { name: 'chat', index: 4 },
  { name: 'profile', index: 5 },
];

// ─── Main App Tabs Layout Swapper (Keep-Alive) ────────────────────────
export default function AppTabs() {
  const [activeTabName, setActiveTabName] = useState('index');
  const scrollRef = useRef<ScrollView>(null);
  const { width: SCREEN_WIDTH } = Dimensions.get('window');

  const handleTabPress = useCallback((routeName: string) => {
    setActiveTabName(routeName);
    const targetIdx = VISIBLE_ROUTES.find(r => r.name === routeName)?.index ?? 0;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: targetIdx * SCREEN_WIDTH, animated: false });
    }, 0);
  }, [SCREEN_WIDTH]);

  useEffect(() => {
    eventBus.emit('tabChanged', activeTabName);
  }, [activeTabName]);

  useEffect(() => {
    const unsub = eventBus.on('switchTab', (routeName: string) => {
      handleTabPress(routeName);
    });
    return unsub;
  }, [handleTabPress]);

  const onScrollEnd = (e: any) => {
    const contentOffset = e.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(contentOffset / SCREEN_WIDTH);
    const targetRoute = VISIBLE_ROUTES.find(r => r.index === pageIndex);
    if (targetRoute && targetRoute.name !== activeTabName) {
      setActiveTabName(targetRoute.name);
    }
  };

  const activeIdx = VISIBLE_ROUTES.find(r => r.name === activeTabName)?.index ?? 0;

  return (
    <TabContext.Provider value={{ activeTabName, setActiveTabName: handleTabPress }}>
      <View style={{ flex: 1, backgroundColor: '#060814' }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          scrollEnabled={false}
          onMomentumScrollEnd={onScrollEnd}
          contentOffset={{ x: activeIdx * SCREEN_WIDTH, y: 0 }}
          style={{ flex: 1 }}
          contentContainerStyle={{ width: SCREEN_WIDTH * 6 }}
        >
          <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
            <HomeScreen />
          </View>
          <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
            <SearchScreen />
          </View>
          <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
            <CreateTripScreen />
          </View>
          <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
            <MapScreen />
          </View>
          <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
            <ChatScreen />
          </View>
          <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
            <ProfileScreen />
          </View>
        </ScrollView>

        <CustomTabBar />
        <InAppNotificationBanner />
      </View>
    </TabContext.Provider>
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
  screenContainer: {
    flex: 1,
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
  tabDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#0C1020',
  },
});
