import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web' || typeof window !== 'undefined';
const memoryStorage = new Map<string, string>();

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (isWeb && typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch (e: any) {
      if (e?.message?.includes('Native module is null')) {
        return memoryStorage.get(key) || null;
      }
      console.warn(`[SafeStorage] getItem failed for ${key}:`, e);
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
    } catch (e: any) {
      memoryStorage.set(key, value);
      if (!e?.message?.includes('Native module is null')) {
        console.warn(`[SafeStorage] setItem failed for ${key}:`, e);
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
    } catch (e: any) {
      memoryStorage.delete(key);
      if (!e?.message?.includes('Native module is null')) {
        console.warn(`[SafeStorage] removeItem failed for ${key}:`, e);
      }
    }
  }
};
