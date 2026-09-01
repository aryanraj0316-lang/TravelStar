import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/lib/logger';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web' || typeof window !== 'undefined';
const memoryStorage = new Map<string, string>();

function isNativeModuleNullError(e: unknown): boolean {
  return e instanceof Error && e.message.includes('Native module is null');
}

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
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
