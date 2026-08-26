// AsyncStorage-backed persister for offline reads (REMEDIATION.md §6.3).
// Deliberately uses AsyncStorage directly, not `safeStorage`/SecureStore:
// this is a bulk, non-sensitive query-result cache (trip lists, guide
// profiles, etc.), not credentials — SecureStore is reserved for tokens
// (§2.9) and is both slower and size-constrained on some platforms.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'travelstar-query-cache',
  throttleTime: 1000,
});

/** How long a persisted cache entry is trusted before being discarded
 * outright rather than shown stale (react-query still separately revalidates
 * anything within this window once back online). */
export const QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
