import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// This screen has been merged into the Create tab.
// Any navigation to /custom-trip redirects to the create tab.
export default function CustomTripRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/create');
  }, []);
  return null;
}
