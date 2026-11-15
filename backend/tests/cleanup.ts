import { closeCache } from '../src/lib/cache';
import { closePresenceStore } from '../src/lib/presence-store';
import { closeLoginAttemptStore } from '../src/services/login-attempts';

afterAll(async () => {
  await closeCache?.();
  await closePresenceStore?.();
  closeLoginAttemptStore?.();
});
