import { Tabs } from 'expo-router';

import { AppTabBar } from '@/components/AppTabBar';
import { InAppNotificationBanner } from '@/components/InAppNotificationBanner';

// Real expo-router tab navigator (REMEDIATION.md §7.1/§7.3), replacing the
// old horizontal-ScrollView "pager" that faked tabs while every screen was
// also independently reachable as a real route — the two systems disagreed
// with each other whenever code called `router.push('/map')` etc. Tabs
// default to `lazy: true`, so only the focused tab mounts on first visit
// instead of all six mounting eagerly at launch (§7.3).
export default function TabsLayout() {
  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <AppTabBar {...props} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="create" />
        <Tabs.Screen name="map" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <InAppNotificationBanner />
    </>
  );
}
