import React from 'react';
import { AnimatedSplashOverlay } from './animated-icon';
import { prepareHomeLaunch } from '@/lib/prefetch-launch';
import { SplashScreen } from 'expo-router';
import { Animated } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as {
  create: (element: React.ReactElement) => { unmount: () => void; update: (element: React.ReactElement) => void };
  act: (callback: () => void | Promise<void>) => Promise<void>;
};
let mockRestoring = false;
const mockApp = { sessionRestored: true, hasOnboarded: true, isLoggedIn: true, profile: { avatar: 'avatar' } };
jest.mock('@/store/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('@tanstack/react-query', () => ({ useIsRestoring: () => mockRestoring }));
jest.mock('@/lib/prefetch-launch', () => ({ prepareHomeLaunch: jest.fn() }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-router', () => {
  const router = { replace: jest.fn() };
  return { SplashScreen: { hideAsync: jest.fn().mockResolvedValue(undefined) }, useRouter: () => router, usePathname: () => '/' };
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask'] });
  jest.clearAllMocks();
  mockRestoring = false;
  jest.spyOn(Animated, 'timing').mockReturnValue({
    start: (callback) => callback?.({ finished: true }), stop: jest.fn(), reset: jest.fn(),
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('releases the launch screen even when image or network warmup never finishes', async () => {
  (prepareHomeLaunch as jest.Mock).mockReturnValue(new Promise(() => {}));
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<AnimatedSplashOverlay />); });
  await act(async () => { jest.advanceTimersByTime(1400); });
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1100); });
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  await act(async () => { root.unmount(); });
});

it('waits for persisted cache restoration and uses the existing minimum splash time', async () => {
  mockRestoring = true;
  (prepareHomeLaunch as jest.Mock).mockResolvedValue(undefined);
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<AnimatedSplashOverlay />); });
  expect(prepareHomeLaunch).not.toHaveBeenCalled();
  mockRestoring = false;
  await act(async () => { root.update(<AnimatedSplashOverlay />); });
  expect(prepareHomeLaunch).toHaveBeenCalledWith(true, 'avatar');
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1400); });
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  await act(async () => { root.unmount(); });
});
