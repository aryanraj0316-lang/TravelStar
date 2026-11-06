import { closeCache } from '../src/lib/cache';
import { closePresenceStore } from '../src/lib/presence-store';

afterAll(async () => {
  await closeCache?.();
  await closePresenceStore?.();
});
