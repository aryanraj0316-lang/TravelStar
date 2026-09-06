import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/lib/logger';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
const memoryStorage = new Map<string, string>();

function isNativeModuleNullError(e: unknown): boolean {
  return e instanceof Error && e.message.includes('Native module is null');
}

// Expo Router's web build also renders once server-side (Node), where
// Platform.OS is already 'web' but `window`/`localStorage` don't exist yet
// and @react-native-async-storage's web shim assumes they do (it throws
// "window is not defined" rather than degrading). Neither branch below is
// reachable there, so this is checked up front rather than relying on
// `typeof localStorage` alone to keep AsyncStorage.getItem/setItem out of
// that path entirely — this in-memory fallback is exactly what a real
// browser round-trip would replace it with anyway.
const isServerSideRender = isWeb && typeof window === 'undefined';

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isServerSideRender) return memoryStorage.get(key) || null;
    try {
      if (isWeb && typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch (e: unknown) {
      if (isNativeModuleNullError(e)) {
        return memoryStorage.get(key) || null;
      }
      logger.warn(`[SafeStorage] getItem failed for ${key}:`, e);
      return memoryStorage.get(key) || null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isServerSideRender) {
      memoryStorage.set(key, value);
      return;
    }
    try {
      if (isWeb && typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
      await AsyncStorage.setItem(key, value);
    } catch (e: unknown) {
      memoryStorage.set(key, value);
      if (!isNativeModuleNullError(e)) {
        logger.warn(`[SafeStorage] setItem failed for ${key}:`, e);
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    if (isServerSideRender) {
      memoryStorage.delete(key);
      return;
    }
    try {
      if (isWeb && typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
      await AsyncStorage.removeItem(key);
    } catch (e: unknown) {
      memoryStorage.delete(key);
      if (!isNativeModuleNullError(e)) {
        logger.warn(`[SafeStorage] removeItem failed for ${key}:`, e);
      }
    }
  }
};
