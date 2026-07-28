import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { Image } from 'expo-image';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppProvider } from '@/store/AppContext';

enableScreens();

Image.prefetch([
  'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1000&q=80',
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
  'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80',
  'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=600&q=80',
  'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=600&q=80'
]);

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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AppProvider>
      <ThemeProvider value={colorScheme === 'dark' ? CustomDarkTheme : CustomLightTheme}>
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
