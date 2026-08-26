// Real device GPS for safety-critical calls — currently only SOS triggers
// (REMEDIATION.md §8.9: `expo-location` was a declared dependency never
// actually used to get a real position; every SOS trigger sent a hardcoded
// or hashed-from-city-name coordinate instead of where the user actually
// was). Never falls back to a guessed location: an SOS sent to the wrong
// place can be worse than no SOS at all, so a failure here must surface as
// a clear error to the caller, not a silent wrong answer.
import * as Location from 'expo-location';
import { logger } from '@/lib/logger';

export type DeviceLocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: 'PERMISSION_DENIED' | 'UNAVAILABLE' };

export async function getCurrentDeviceLocation(): Promise<DeviceLocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { ok: false, reason: 'PERMISSION_DENIED' };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return { ok: true, latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (e) {
    logger.error('[DeviceLocation] Failed to get current position:', e);
    return { ok: false, reason: 'UNAVAILABLE' };
  }
}
