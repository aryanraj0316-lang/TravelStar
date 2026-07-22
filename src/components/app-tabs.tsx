import { Tabs } from 'expo-router';
import {
  Home,
  Map,
  MessageSquare,
  PlusCircle,
  Search,
  User,
  Plane,
  Train,
  Car,
  Bike,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
  Text,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

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

export type TravelVehicle = 'FLIGHT' | 'TRAIN' | 'CAR' | 'BIKE';
const VEHICLE_SEQUENCE: TravelVehicle[] = ['FLIGHT', 'TRAIN', 'CAR', 'BIKE'];

// ─── Top Border Vehicle Animation Banner ───────────────────────────────
function NavTravelBanner({
  animValue,
  startX,
  targetX,
  vehicleType,
}: {
  animValue: Animated.Value;
  startX: number;
  targetX: number;
  vehicleType: TravelVehicle;
}) {
  const isMovingRight = targetX >= startX;

  const currentX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [startX, targetX],
  });

  // Flight High Altitude Take-Off Arc (-35px sky lift!)
  const flightY = animValue.interpolate({
    inputRange: [0, 0.25, 0.75, 1],
    outputRange: [0, -35, -35, 0],
  });

  // Takeoff nose pitch rotation: tilts UP in direction of flight, then levels off and lands down!
  const flightRotate = animValue.interpolate({
    inputRange: [0, 0.25, 0.75, 1],
    outputRange: isMovingRight
      ? ['0deg', '-28deg', '-8deg', '10deg']
      : ['0deg', '28deg', '8deg', '-10deg'],
  });

  // Gentle road bounce for Train/Car/Bike
  const vehicleBounceY = animValue.interpolate({
    inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
    outputRange: [0, -3, 0, -3, 0, 0],
  });

  const opacity = animValue.interpolate({
    inputRange: [0, 0.05, 0.95, 1],
    outputRange: [0, 1, 1, 0],
  });

  // Airplane ✈️ emoji points RIGHT by default: moving RIGHT uses scaleX: 1, moving LEFT uses scaleX: -1
  const planeScaleX = isMovingRight ? 1 : -1;

  // Ground vehicles (🚗, 🏍️, 🚂) point LEFT by default: moving RIGHT uses scaleX: -1, moving LEFT uses scaleX: 1
  const groundScaleX = isMovingRight ? -1 : 1;

  // 1. FLIGHT ✈️ (High Altitude Take-Off)
  if (vehicleType === 'FLIGHT') {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.travelVehicleWrap,
          {
            left: currentX,
            opacity: opacity,
            transform: [
              { translateY: flightY },
              { rotate: flightRotate },
              { scaleX: planeScaleX },
            ],
          },
        ]}
      >
        <Text style={styles.largeEmojiVehicle}>✈️</Text>
      </Animated.View>
    );
  }

  // 2. TRAIN 🚂🚃🚃🚃 (Compound Emoji Train with 3 coaches)
  if (vehicleType === 'TRAIN') {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.travelVehicleWrap,
          {
            left: currentX,
            opacity: opacity,
            transform: [
              { translateY: vehicleBounceY },
              { scaleX: groundScaleX },
            ],
          },
        ]}
      >
        <Text style={styles.largeEmojiVehicle}>🚂🚃🚃🚃</Text>
      </Animated.View>
    );
  }

  // 3. CAR 🚗
  if (vehicleType === 'CAR') {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.travelVehicleWrap,
          {
            left: currentX,
            opacity: opacity,
            transform: [
              { translateY: vehicleBounceY },
              { scaleX: groundScaleX },
            ],
          },
        ]}
      >
        <Text style={styles.largeEmojiVehicle}>🚗</Text>
      </Animated.View>
    );
  }

  // 4. BIKE 🏍️
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.travelVehicleWrap,
        {
          left: currentX,
          opacity: opacity,
          transform: [
            { translateY: vehicleBounceY },
            { scaleX: groundScaleX },
          ],
        },
      ]}
    >
      <Text style={styles.largeEmojiVehicle}>🏍️</Text>
    </Animated.View>
  );
}

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
      friction: 6,
      tension: 110,
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
            colors={['#00F2FE', '#0066FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.activePillCapsule}
          >
            <Icon size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.activePillLabel}>{label}</Text>
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

  const activeIndex = state.index;
  const prevIndexRef = useRef(activeIndex);
  const vehicleIndexRef = useRef(0);

  const [animating, setAnimating] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [dockWidth, setDockWidth] = useState(0);
  const [vehicleType, setVehicleType] = useState<TravelVehicle>('FLIGHT');
  const [startX, setStartX] = useState(0);
  const [targetX, setTargetX] = useState(0);

  const animValue = useRef(new Animated.Value(0)).current;
  const tabCenterXRef = useRef<Record<number, number>>({});

  useEffect(() => {
    prevIndexRef.current = activeIndex;
  }, [activeIndex]);

  const visibleRoutes = state.routes.filter(
    (r: any) => ['index', 'search', 'create', 'map', 'chat', 'profile'].includes(r.name)
  );

  const getTabX = (idx: number) => {
    if (tabCenterXRef.current[idx] !== undefined && tabCenterXRef.current[idx] > 0) {
      return tabCenterXRef.current[idx];
    }
    const widthToUse = dockWidth > 0 ? dockWidth : 360;
    const tabSlotWidth = widthToUse / 6;
    return tabSlotWidth * idx + tabSlotWidth / 2 - 21;
  };

  const handleTabPress = (routeKey: string, routeName: string, index: number) => {
    const isFocused = activeIndex === index;

    if (!isFocused) {
      const fromX = getTabX(prevIndexRef.current);
      const toX = getTabX(index);

      const nextVehicleIndex = (vehicleIndexRef.current + 1) % VEHICLE_SEQUENCE.length;
      vehicleIndexRef.current = nextVehicleIndex;
      const nextVehicle = VEHICLE_SEQUENCE[nextVehicleIndex];

      setStartX(fromX);
      setTargetX(toX);
      setVehicleType(nextVehicle);
      setAnimKey((prev) => prev + 1);
      setAnimating(true);
      animValue.setValue(0);

      Animated.timing(animValue, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        setAnimating(false);
      });

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

  return (
    <View
      style={[styles.floatingDockWrap, { bottom: Math.max(insets.bottom, 12) }]}
      onLayout={(e) => setDockWidth(e.nativeEvent.layout.width)}
    >
      
      {/* Top Border Vehicle Animation Track */}
      {animating && (
        <NavTravelBanner
          key={animKey}
          animValue={animValue}
          startX={startX}
          targetX={targetX}
          vehicleType={vehicleType}
        />
      )}

      {/* Laser Rail Track Accent */}
      {animating && (
        <Animated.View
          key={`laser-${animKey}`}
          pointerEvents="none"
          style={[
            styles.laserRailTrack,
            {
              left: Math.min(startX, targetX) + 18,
              width: Math.abs(targetX - startX),
              opacity: animValue.interpolate({
                inputRange: [0, 0.1, 0.9, 1],
                outputRange: [0, 0.9, 0.9, 0],
              }),
            },
          ]}
        />
      )}

      <LinearGradient
        colors={isDark ? ['rgba(20, 25, 45, 0.96)', 'rgba(8, 10, 20, 0.98)'] : ['#FFFFFF', '#F1F5F9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.tabBarContainer,
          {
            borderColor: isDark ? 'rgba(0, 242, 254, 0.22)' : '#CBD5E1',
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
                tabCenterXRef.current[idx] = x + width / 2 - 21; // Offset for 42px badge
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
    </View>
  );
}

// ─── Main App Tabs Navigator ────────────────────────────────────────
export default function AppTabs() {
  return (
    <Tabs
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
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 18,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePillCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 5,
    shadowColor: '#00F2FE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  activePillLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  inactiveTabBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inactiveTabLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },

  // Travel Vehicle Animations
  travelVehicleWrap: {
    position: 'absolute',
    top: -38,
    zIndex: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeEmojiVehicle: {
    fontSize: 32,
    lineHeight: 38,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 242, 254, 0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  laserRailTrack: {
    position: 'absolute',
    top: -2,
    height: 3,
    backgroundColor: '#00F2FE',
    zIndex: 110,
    borderRadius: 2,
    shadowColor: '#00F2FE',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 5,
    elevation: 6,
  },
});
