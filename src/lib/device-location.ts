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
// with no GPS fix available (very common for an emulator with no mock
// location configured), it can hang indefinitely, leaving a caller's UI on
// its loading state forever. Every read below is raced against this so a
// bad fix always surfaces as a real, retryable failure instead of a spinner
// that never resolves.
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

/** As above, plus the "we have not asked yet" case only the passive read below can report. */
export type PassiveDeviceLocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: 'PERMISSION_DENIED' | 'PERMISSION_NOT_REQUESTED' | 'UNAVAILABLE' };

/**
 * Reads the device position only if foreground location permission has
 * already been granted, and never shows the system permission dialog.
 *
 * This exists for ambient, non-critical features — the home screen's live
 * weather card — where prompting for location the moment the app opens,
 * before the user has asked for anything, is the wrong trade. The caller
 * renders a "turn on location" affordance for `PERMISSION_NOT_REQUESTED`
 * and calls `getCurrentDeviceLocation()` (which does prompt) from that
 * button, so the dialog is always a response to a deliberate tap.
 */
export async function getDeviceLocationIfPermitted(): Promise<PassiveDeviceLocationResult> {
  try {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      // `canAskAgain` separates "not asked yet" (a prompt would work) from
      // "already refused" (only the system settings screen can undo it).
      return { ok: false, reason: canAskAgain ? 'PERMISSION_NOT_REQUESTED' : 'PERMISSION_DENIED' };
    }

    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      POSITION_TIMEOUT_MS,
    );

    return { ok: true, latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (e) {
    logger.warn('[DeviceLocation] Passive position read failed:', e);
    return { ok: false, reason: 'UNAVAILABLE' };
  }
}

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
