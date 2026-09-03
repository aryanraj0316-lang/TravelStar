import type * as Api from '@/services/api';
import type * as OfflineMutationQueue from './offline-mutation-queue';

const mockToast = jest.fn();

jest.mock('@/lib/feedback', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));

// The queue holds its state (queue array, hydrated/flushing flags, and the
// registered-handlers map) at module scope, so each test needs a fresh
// module instance rather than the one shared ES-import singleton. A plain
// `require` (rather than a dynamic `import()`, which this project's Babel/
// Jest setup can't evaluate outside --experimental-vm-modules) re-runs the
// module body under `resetModules`. `ApiError` has to come from that same
// fresh `require` of '@/services/api', not a top-level import of this test
// file — resetModules gives every module its own registry, so a class
// constructed against one registry's `ApiError` fails `instanceof` against
// another registry's copy of the same class.
function freshQueue(): { queue: typeof OfflineMutationQueue; ApiError: typeof Api.ApiError } {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports -- test-only module reload, see comment above */
  return {
    queue: require('./offline-mutation-queue'),
    ApiError: require('@/services/api').ApiError,
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

beforeEach(() => {
  mockToast.mockClear();
});

describe('offline mutation queue', () => {
  it('runs a queued mutation through its registered handler on flush', async () => {
    const { queue: { enqueueMutation, flushMutationQueue, registerMutationHandler, queuedMutationCount } } = freshQueue();
    const handler = jest.fn().mockResolvedValue(undefined);
    registerMutationHandler('join-request', handler);

    await enqueueMutation('join-request', { tripId: 'trip-1' });
    expect(queuedMutationCount()).toBe(1);

    await flushMutationQueue();

    expect(handler).toHaveBeenCalledWith({ tripId: 'trip-1' });
    expect(queuedMutationCount()).toBe(0);
  });

  it('processes queued items in FIFO order', async () => {
    const { queue: { enqueueMutation, flushMutationQueue, registerMutationHandler } } = freshQueue();
    const seen: unknown[] = [];
    registerMutationHandler('sos', async (payload) => {
      seen.push(payload);
    });

    await enqueueMutation('sos', { order: 1 });
    await enqueueMutation('sos', { order: 2 });
    await enqueueMutation('sos', { order: 3 });
    await flushMutationQueue();

    expect(seen).toEqual([{ order: 1 }, { order: 2 }, { order: 3 }]);
  });

  it('stops the flush on a network-level failure and keeps the item queued for retry', async () => {
    const { queue: { enqueueMutation, flushMutationQueue, registerMutationHandler, queuedMutationCount } } = freshQueue();
    const handler = jest.fn().mockRejectedValue(new Error('Network request failed'));
    registerMutationHandler('join-request', handler);

    await enqueueMutation('join-request', { tripId: 'trip-1' });
    await flushMutationQueue();

    expect(queuedMutationCount()).toBe(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('drops an item the server rejected (4xx) rather than retrying it forever', async () => {
    const {
      queue: { enqueueMutation, flushMutationQueue, registerMutationHandler, queuedMutationCount },
      ApiError,
    } = freshQueue();
    const handler = jest
      .fn()
      .mockRejectedValue(new ApiError('VALIDATION_FAILED', 'That trip is full.', 422));
    registerMutationHandler('join-request', handler);

    await enqueueMutation('join-request', { tripId: 'trip-1' });
    await flushMutationQueue();

    expect(queuedMutationCount()).toBe(0);
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('That trip is full.'), 'error');
  });

  it('continues past a rejected item to the ones queued after it', async () => {
    const {
      queue: { enqueueMutation, flushMutationQueue, registerMutationHandler },
      ApiError,
    } = freshQueue();
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('VALIDATION_FAILED', 'bad', 400))
      .mockResolvedValueOnce(undefined);
    registerMutationHandler('sos', handler);

    await enqueueMutation('sos', { order: 1 });
    await enqueueMutation('sos', { order: 2 });
    await flushMutationQueue();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('drops an item with no registered handler rather than blocking the queue', async () => {
    const { queue: { enqueueMutation, flushMutationQueue, queuedMutationCount } } = freshQueue();

    await enqueueMutation('sos', { tripId: 'trip-1' });
    await flushMutationQueue();

    expect(queuedMutationCount()).toBe(0);
  });

  it('does not re-enter a flush that is already running', async () => {
    const { queue: { enqueueMutation, flushMutationQueue, registerMutationHandler } } = freshQueue();
    let concurrentCalls = 0;
    let maxConcurrent = 0;
    registerMutationHandler('join-request', async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrentCalls--;
    });

    await enqueueMutation('join-request', { n: 1 });
    await enqueueMutation('join-request', { n: 2 });

    await Promise.all([flushMutationQueue(), flushMutationQueue()]);

    expect(maxConcurrent).toBe(1);
  });
});
