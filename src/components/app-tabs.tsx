import React, { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import {
  useColorScheme,
  Platform,
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import {
  Home,
  Search,
  Map,
  MessageSquare,
  PlusCircle,
  User,
} from 'lucide-react-native';

import { Colors } from '@/constants/theme';

// ─── Animated Tab Button ────────────────────────────────────────────
function AnimatedTabButton({
  label,
  isFocused,
  onPress,
  onLongPress,
  icon: Icon,
  activeColor,
  inactiveColor,
}: {
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  icon: typeof Home;
  activeColor: string;
  inactiveColor: string;
}) {
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const translateAnim = useRef(new Animated.Value(isFocused ? -6 : 0)).current;
  const dotOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      // Scale bounce
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1 : 0,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }),
      // Move icon up
      Animated.spring(translateAnim, {
        toValue: isFocused ? -6 : 0,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      // Indicator dot
      Animated.timing(dotOpacity, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFocused]);

  const iconScale = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });

  const color = isFocused ? activeColor : inactiveColor;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={styles.tabButton}
    >
      <Animated.View
        style={{
          transform: [{ scale: iconScale }, { translateY: translateAnim }],
          alignItems: 'center',
        }}
      >
        <Icon size={22} color={color} strokeWidth={isFocused ? 2.5 : 1.8} />
      </Animated.View>

      <Animated.Text
        style={[
          styles.tabLabel,
          {
            color,
            fontWeight: isFocused ? '800' : '600',
            transform: [{ translateY: translateAnim }],
          },
        ]}
      >
        {label}
      </Animated.Text>

      {/* Active indicator dot */}
      <Animated.View
        style={[
          styles.activeDot,
          {
            opacity: dotOpacity,
            backgroundColor: activeColor,
            transform: [{ translateY: translateAnim }],
          },
        ]}
      />
    </TouchableOpacity>
  );
}

// ─── Custom Tab Bar ─────────────────────────────────────────────────
const TAB_ICONS: Record<string, typeof Home> = {
  index: Home,
  search: Search,
  create: PlusCircle,
  map: Map,
  chat: MessageSquare,
  profile: User,
};

function CustomTabBar({ state, descriptors, navigation }: any) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
      {state.routes.filter((r:any)=>r.name!=='explore').map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;
        const isFocused = state.index === index;
        const Icon = TAB_ICONS[route.name] || Home;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <AnimatedTabButton
            key={route.key}
            label={label}
            isFocused={isFocused}
            onPress={onPress}
            onLongPress={onLongPress}
            icon={Icon}
            activeColor={colors.text}
            inactiveColor={colors.textSecondary}
          />
        );
      })}
    </View>
  );
}

// ─── Main Tabs Component ────────────────────────────────────────────
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
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 4,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
  },
});
