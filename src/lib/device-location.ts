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

// getCurrentPositionAsync has no built-in timeout — on a device or emulator
// with no GPS fix available, it can hang indefinitely, leaving a caller's
// UI on its loading state forever. The read below is raced against this so
// a bad fix always surfaces as a real, retryable failure instead of a
// spinner that never resolves.
const POSITION_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// High accuracy: prefers a true GPS satellite fix over network-based
// positioning. A precise fix can legitimately take longer, or fail
// outright, indoors or with a poor sky view; that shows up as UNAVAILABLE
// rather than silently falling back to something less precise, which is
// the correct trade for an emergency location — never weaken this tier.
export async function getCurrentDeviceLocation(): Promise<DeviceLocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { ok: false, reason: 'PERMISSION_DENIED' };
    }

    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      POSITION_TIMEOUT_MS,
    );

    return { ok: true, latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (e) {
    logger.error('[DeviceLocation] Failed to get current position:', e);
    return { ok: false, reason: 'UNAVAILABLE' };
  }
}
