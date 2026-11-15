/** A video is ready only once a frame renders; its poster is not playback. */
export function isStoryMediaReady(mediaUrl: string | null, isVideo: boolean, rendered: boolean, prefetched: boolean) {
  return !mediaUrl || rendered || (!isVideo && prefetched);
}
