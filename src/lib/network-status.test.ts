import type NetInfoDefault from '@react-native-community/netinfo';
import type { NetInfoState } from '@react-native-community/netinfo';
import type * as NetworkStatus from './network-status';

// network-status.ts registers its NetInfo listener at module scope on first
// import, and keeps online/subscriber state at module scope too — so each
// test gets a fresh module instance (and a fresh NetInfo mock from the same
// registry, since resetModules gives every module its own) rather than
// sharing state, or relying on cross-test ordering, with the others.
function freshModule(): { networkStatus: typeof NetworkStatus; netInfo: typeof NetInfoDefault } {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports -- test-only module reload, see comment above */
  return {
    networkStatus: require('./network-status'),
    // The mock's module.exports IS the default export at runtime; the
    // `.default` wrapper only exists after Babel's ESM interop transform,
    // which a plain `require()` here bypasses.
    netInfo: require('@react-native-community/netinfo'),
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

function emitNetInfoState(netInfo: typeof NetInfoDefault, state: Partial<NetInfoState>): void {
  const addEventListener = netInfo.addEventListener as jest.Mock;
  const callback = addEventListener.mock.calls[0][0] as (state: Partial<NetInfoState>) => void;
  callback(state);
}

describe('isOnline / onReconnect', () => {
  it('starts online (the module default before any NetInfo event)', () => {
    const { networkStatus } = freshModule();
    expect(networkStatus.isOnline()).toBe(true);
  });

  it('does not fire onReconnect for a transition to offline', () => {
    const { networkStatus, netInfo } = freshModule();
    const callback = jest.fn();
    networkStatus.onReconnect(callback);

    emitNetInfoState(netInfo, { isConnected: false, isInternetReachable: false });

    expect(networkStatus.isOnline()).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });

  it('fires onReconnect when connectivity transitions back to online', () => {
    const { networkStatus, netInfo } = freshModule();
    const callback = jest.fn();
    networkStatus.onReconnect(callback);

    emitNetInfoState(netInfo, { isConnected: false, isInternetReachable: false });
    emitNetInfoState(netInfo, { isConnected: true, isInternetReachable: true });

    expect(networkStatus.isOnline()).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('treats a connected network with unreachable internet as offline (captive portal / dead router)', () => {
    const { networkStatus, netInfo } = freshModule();
    emitNetInfoState(netInfo, { isConnected: true, isInternetReachable: false });
    expect(networkStatus.isOnline()).toBe(false);
  });

  it('does not re-fire while already online', () => {
    const { networkStatus, netInfo } = freshModule();
    const callback = jest.fn();
    networkStatus.onReconnect(callback);

    // Already online at module start; a same-state event is not a transition.
    emitNetInfoState(netInfo, { isConnected: true, isInternetReachable: true });

    expect(callback).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const { networkStatus, netInfo } = freshModule();
    const callback = jest.fn();
    const unsubscribe = networkStatus.onReconnect(callback);
    unsubscribe();

    emitNetInfoState(netInfo, { isConnected: false, isInternetReachable: false });
    emitNetInfoState(netInfo, { isConnected: true, isInternetReachable: true });

    expect(callback).not.toHaveBeenCalled();
  });
});
