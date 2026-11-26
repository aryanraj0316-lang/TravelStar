// Single source of truth for "are we online" (REMEDIATION.md §6.3). Exposes
// both a plain function for non-component code (the offline mutation queue
// needs to check this outside React) and a hook for the banner/UI.
//
// `isConnected` is true for e.g. a Wi-Fi network with no internet (a captive
// portal, a dead router) — `isInternetReachable` is NetInfo's best-effort
// probe of actual reachability and is null until the first probe resolves.
// We treat "online" as `isConnected && isInternetReachable !== false` so we
// don't show a false "offline" banner during that initial null window.
import { useSyncExternalStore } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { logger } from '@/lib/logger';

function deriveOnline(state: NetInfoState): boolean {
  return !!state.isConnected && state.isInternetReachable !== false;
}

let currentlyOnline = true;
const listeners = new Set<(online: boolean) => void>();

try {
  NetInfo.addEventListener((state) => {
    const online = deriveOnline(state);
    if (online === currentlyOnline) return;
    currentlyOnline = online;
    listeners.forEach((l) => l(online));
  });
} catch (e) {
  // Registration itself throwing (rather than a later event) would mean the
  // native module isn't available at all — nothing here retries, so this is
  // worth knowing about rather than silently assuming "always online".
  logger.warn('[NetworkStatus] Failed to register NetInfo listener:', e);
}

/** Current online state, for non-component code (e.g. the mutation queue). */
export function isOnline(): boolean {
  return currentlyOnline;
}

/** Fires every time connectivity transitions from offline to online. Does
 * NOT fire for the current state — only on a later reconnect event. Use this
 * for a persistent "resync on reconnect" subscription (e.g. the offline
 * mutation queue); calling `callback` unconditionally when already online
 * would make a "resubscribe after each flush" loop recurse synchronously. */
export function onReconnect(callback: () => void): () => void {
  const listener = (online: boolean) => {
    if (online) callback();
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function subscribeOnline(callback: () => void): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

export function useOnlineStatus(): boolean {
  // A static export has no device network. Use a deterministic snapshot
  // for its HTML and hydration, then read the browser/device state.
  return useSyncExternalStore(subscribeOnline, isOnline, () => true);
}
