import { Image } from 'expo-image';
import { queryClient } from '@/lib/query-client';
import { prefetchLaunchData, prepareHomeLaunch } from './prefetch-launch';

jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn().mockResolvedValue(true) } }));
jest.mock('@/services/api', () => ({ apiService: {} }));
jest.mock('@/lib/query-client', () => ({ queryClient: { getQueryData: jest.fn(), prefetchQuery: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

it('warms the story avatar and media without waiting for the inbox', async () => {
  let finishChat!: () => void;
  const chat = new Promise<void>((resolve) => { finishChat = resolve; });
  (queryClient.getQueryData as jest.Mock).mockImplementation((key: string[]) => key[0] === 'feed'
    ? [{ id: 'story', sourceType: 'STORY', authorAvatar: 'avatar-fast', mediaUrl: 'image-fast', createdAt: new Date().toISOString() }] : []);
  (queryClient.prefetchQuery as jest.Mock).mockImplementation((options) => options.queryKey[0] === 'chats' ? chat : Promise.resolve());
  const launch = prefetchLaunchData();
  expect(Image.prefetch).toHaveBeenCalledWith('avatar-fast', 'memory-disk');
  expect(Image.prefetch).toHaveBeenCalledWith('image-fast', 'memory-disk');
  finishChat();
  await launch;
  // Parallel launch callers share each image's download.
  expect((Image.prefetch as jest.Mock).mock.calls.filter(([uri]) => uri === 'avatar-fast')).toHaveLength(1);
});

it('prepares public home images without fetching private feed for a signed-out launch', async () => {
  (queryClient.getQueryData as jest.Mock).mockImplementation((key: string[]) => key[0] === 'destinations' ? [{ image: 'destination-cached' }] : []);
  (queryClient.prefetchQuery as jest.Mock).mockResolvedValue(undefined);
  await prepareHomeLaunch(false);
  expect(Image.prefetch).toHaveBeenCalledWith('destination-cached', 'memory-disk');
  expect((queryClient.prefetchQuery as jest.Mock).mock.calls.some(([options]) => options.queryKey[0] === 'feed')).toBe(false);
});
