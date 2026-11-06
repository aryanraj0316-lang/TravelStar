import { useEffect, useState } from 'react';
import { apiService } from '@/services/api';
import { useApp } from '@/store/AppContext';

// Fetch through the authenticated API on web AND native. Never hand public
// bucket URLs to Image, and never persist the decoded bytes in shared caches.
export function usePrivateChatImage(ref: string | undefined | null): string | undefined {
  const { profile, isLoggedIn } = useApp();
  const [image, setImage] = useState<{ ref: string; userId: string; uri: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const id = ref?.match(/^chat-private:([0-9a-f-]{36})$/i)?.[1];
    if (id && isLoggedIn && profile.id) {
      const userId = profile.id;
      void apiService
        .getPrivateChatImage(id)
        .then((result) => {
          if (!cancelled && result?.uri) setImage({ ref: ref!, userId, uri: result.uri });
        })
        .catch(() => {
          /* A removed attachment or membership stays unavailable. */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [ref, profile.id, isLoggedIn]);
  return isLoggedIn && image && image.ref === ref && image.userId === profile.id ? image.uri : undefined;
}
