import { DarkTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { enableScreens } from 'react-native-screens';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppProvider } from '@/store/AppContext';

enableScreens();

void SplashScreen.preventAutoHideAsync();

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
    <AppProvider>
      <ThemeProvider value={AppTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
          <Stack.Screen name="stories" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack>
      </ThemeProvider>
    </AppProvider>
  );
}
