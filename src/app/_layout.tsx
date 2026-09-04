import '@/global.css';

import { DarkTheme, ThemeProvider, Stack, type ErrorBoundaryProps, SplashScreen } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RouteErrorFallback } from '@/components/route-error-fallback';
import { AppProvider } from '@/store/AppContext';
import { FeedbackProvider } from '@/lib/feedback';
import { queryClient } from '@/lib/query-client';
import { queryPersister, QUERY_CACHE_MAX_AGE_MS } from '@/lib/query-persister';
import { startMutationQueueAutoFlush } from '@/lib/offline-mutation-queue';
import { useNotificationRouter } from '@/lib/use-notification-router';
import { initI18n } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { C } from '@/theme/tokens';

// Synchronous (resources are bundled) — must run before any component
// calls useTranslation(). See src/lib/i18n.ts for why this doesn't need
// to gate first render.
initI18n();

// Root error boundary (REMEDIATION.md §7.5) — expo-router auto-wraps the
// whole app in this when a named `ErrorBoundary` export exists on the root
// layout, catching anything not already caught by a more specific screen's
// own boundary (including a crash inside the providers below).
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorFallback {...props} />;
}

void SplashScreen.preventAutoHideAsync().catch((e) => logger.warn('[Splash] preventAutoHideAsync failed:', e));

// The app is dark-mode only for now — see docs/REMEDIATION.md §1.3. A real
// light theme is Phase 9 design-system work; until then we don't pretend to
// support one.
const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.card,
  },
};

export default function RootLayout() {
  // Client-only: on web this layout also renders during Expo Router's SSR
  // pass, where `window`/AsyncStorage don't exist. A useEffect never runs
  // during SSR (only after hydration in the browser), unlike the previous
  // module-scope call which fired on every server render too and threw
  // inside safeStorage (caught, but noisy and pointless server-side).
  useEffect(() => {
    startMutationQueueAutoFlush();
  }, []);

  // Notification taps deep-link into the app, and the badge resyncs on
  // foreground (docs/REMEDIATION.md §8.18).
  useNotificationRouter();

  return (
    <SafeAreaProvider>
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
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
                <Stack.Screen name="stories" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
              </Stack>
            </ThemeProvider>
          </AppProvider>
        </FeedbackProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
