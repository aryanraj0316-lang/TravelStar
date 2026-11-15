import { safeStorage } from '@/services/storage';
import { getViewedStories, loadStoryViews, markStoryViewed, unseenStoriesFirst } from './story-view-state';

jest.mock('@/services/storage', () => ({ safeStorage: { getItem: jest.fn(), setItem: jest.fn().mockResolvedValue(undefined) } }));

it('keeps unseen stories first and moves the newly viewed story to the end', () => {
  const items = [{ id: 'newest' }, { id: 'middle' }, { id: 'oldest' }];
  const viewed = new Set(['oldest', 'newest']);
  expect(unseenStoriesFirst(items, viewed).map((item) => item.id)).toEqual(['middle', 'oldest', 'newest']);
  expect(items.map((item) => item.id)).toEqual(['newest', 'middle', 'oldest']);
});

it('restores recent views, drops expired views, and isolates accounts', async () => {
  (safeStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify({ recent: Date.now(), expired: Date.now() - 90_000_000 }));
  await loadStoryViews('restore-account');
  expect([...getViewedStories('restore-account')]).toEqual(['recent']);
  expect([...getViewedStories('another-account')]).toEqual([]);
});

it('keeps a newly viewed story when persisted state finishes loading later', async () => {
  let resolve!: (value: string) => void;
  (safeStorage.getItem as jest.Mock).mockReturnValueOnce(new Promise<string>((done) => { resolve = done; }));
  const loading = loadStoryViews('slow-account');
  markStoryViewed('slow-account', 'just-opened');
  expect(getViewedStories('slow-account').has('just-opened')).toBe(true);
  resolve(JSON.stringify({ earlier: Date.now() - 5000 }));
  await loading;
  await new Promise((done) => setTimeout(done, 0));
  expect([...getViewedStories('slow-account')]).toEqual(['earlier', 'just-opened']);
  expect(safeStorage.setItem).toHaveBeenCalledWith('@viewed_stories:slow-account', expect.stringContaining('just-opened'));
});
