import type { ErrorBoundaryProps } from 'expo-router';

import HomeScreen from '@/screens/home-screen';
import { RouteErrorFallback } from '@/components/route-error-fallback';

export default function Index() {
  return <HomeScreen />;
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorFallback {...props} label="Home" />;
}
