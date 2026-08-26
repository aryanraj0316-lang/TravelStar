import { DarkTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { enableScreens } from 'react-native-screens';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppProvider } from '@/store/AppContext';
import { FeedbackProvider } from '@/lib/feedback';
import { queryClient } from '@/lib/query-client';
import { queryPersister, QUERY_CACHE_MAX_AGE_MS } from '@/lib/query-persister';
import { startMutationQueueAutoFlush } from '@/lib/offline-mutation-queue';

enableScreens();

void SplashScreen.preventAutoHideAsync();

// Registered once at module scope (mirrors preventAutoHideAsync above):
// hydrates any queued offline writes from the last session and starts
// listening for reconnect events. See src/lib/offline-mutation-queue.ts.
startMutationQueueAutoFlush();

// The app is dark-mode only for now — see docs/REMEDIATION.md §1.3. A real
// light theme is Phase 9 design-system work; until then we don't pretend to
// support one.
const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#060814',
    card: '#111322',
  },
};

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: QUERY_CACHE_MAX_AGE_MS }}
    >
      <FeedbackProvider>
        <AppProvider>
          <ThemeProvider value={AppTheme}>
            <AnimatedSplashOverlay />
            <OfflineBanner />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
              <Stack.Screen name="stories" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            </Stack>
          </ThemeProvider>
        </AppProvider>
      </FeedbackProvider>
    </PersistQueryClientProvider>
  );
}
