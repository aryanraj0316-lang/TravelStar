import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AppProvider } from '@/store/AppContext';

SplashScreen.preventAutoHideAsync();

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#060814',
    card: '#111322',
  },
};

const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#060814',
    card: '#111322',
  },
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <AppProvider>
      <ThemeProvider value={colorScheme === 'dark' ? CustomDarkTheme : CustomLightTheme}>
        <AnimatedSplashOverlay />
        <AppTabs />
      </ThemeProvider>
    </AppProvider>
  );
}
