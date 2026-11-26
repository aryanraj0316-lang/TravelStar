import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { readStoryMedia } from './story-upload';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
const originalPlatform = Platform.OS;
const originalFetch = globalThis.fetch;
const originalReader = globalThis.FileReader;

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalPlatform });
  globalThis.fetch = originalFetch;
  globalThis.FileReader = originalReader;
  jest.clearAllMocks();
});

it.each(['blob:https://site.test/selected-image', 'data:image/png;base64,cGljdHVyZQ=='])('reads browser picker URL %s without a native File', async (uri) => {
  Object.defineProperty(Platform, 'OS', { value: 'web' });
  const blob = { type: 'image/png' };
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => blob });
  globalThis.FileReader = class {
    result = 'data:image/png;base64,cGljdHVyZQ==';
    onload?: () => void;
    readAsDataURL(value: unknown) { expect(value).toBe(blob); this.onload?.(); }
  } as unknown as typeof FileReader;
  expect(await readStoryMedia(uri, 'image/jpeg')).toEqual({ base64: 'cGljdHVyZQ==', contentType: 'image/png' });
  expect(File).not.toHaveBeenCalled();
});

it('preserves native filesystem reads', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'android' });
  (File as unknown as jest.Mock).mockImplementation(() => ({ base64: async () => 'native-bytes' }));
  expect(await readStoryMedia('file:///story.jpg', 'image/jpeg')).toEqual({ base64: 'native-bytes', contentType: 'image/jpeg' });
});

it('rejects an unreadable browser file', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'web' });
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: false });
  await expect(readStoryMedia('blob:expired', 'image/jpeg')).rejects.toThrow('Could not read');
});
