import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Thrown when the platform's secure credential store is unavailable. Callers
 * must surface this to the user ("Unable to save your session on this
 * device") rather than silently proceeding — a session that appears to be
 * saved but isn't means the user thinks they're logged in while every
 * request 401s.
 */
export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Unable to access secure storage on this device.');
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}

const isWeb = Platform.OS === 'web';

/**
 * Storage for auth tokens only. Never used for profile data or preferences —
 * see src/services/storage.ts for that.
 *
 * Native: iOS Keychain / Android Keystore via expo-secure-store.
 * Web: expo-secure-store has no web implementation at all, and there is no
 * OS keychain equivalent reachable from JS without a larger architecture
 * change (httpOnly cookies issued by the server). localStorage is used as
 * the closest available primitive — it is not a security downgrade from
 * what this app had before, but it is not Keychain-equivalent either.
 *
 * In both cases, a failure throws rather than falling back to an in-memory
 * Map, which is what silently produced "logged in until the process dies"
 * sessions before.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (isWeb) {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      }
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      throw new StorageUnavailableError(e);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (isWeb) {
        if (typeof localStorage === 'undefined') throw new Error('localStorage unavailable');
        localStorage.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      throw new StorageUnavailableError(e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (isWeb) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      throw new StorageUnavailableError(e);
    }
  },
};
