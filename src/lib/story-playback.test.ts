import { isStoryMediaReady } from './story-playback';

describe('story view readiness', () => {
  it('allows a text-only story without waiting for an image callback', () => {
    expect(isStoryMediaReady(null, false, false, false)).toBe(true);
  });
  it('waits for a first video frame even when an asset was prefetched', () => {
    expect(isStoryMediaReady('video.mp4', true, false, true)).toBe(false);
    expect(isStoryMediaReady('video.mp4', true, true, false)).toBe(true);
  });
  it('allows a rendered or cached image and waits for uncached images', () => {
    expect(isStoryMediaReady('photo.jpg', false, false, false)).toBe(false);
    expect(isStoryMediaReady('photo.jpg', false, false, true)).toBe(true);
    expect(isStoryMediaReady('photo.jpg', false, true, false)).toBe(true);
  });
});
