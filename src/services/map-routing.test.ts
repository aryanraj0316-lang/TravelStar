import { resolveRoute } from './map-routing';

const A = { latitude: 23.3441, longitude: 85.3096 };
const B = { latitude: 23.7957, longitude: 86.4304 };

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // Fallback paths log a warning by design; keep the test output clean.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Each test uses distinct coordinates so the module's in-memory route
// cache from one test never answers another.
const shift = (p: typeof A, d: number) => ({ latitude: p.latitude + d, longitude: p.longitude + d });

describe('resolveRoute', () => {
  it('uses OSRM road geometry, distance and duration when it answers', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', distance: 124_000, duration: 9_900 }],
      }),
    });
    const route = await resolveRoute('car', shift(A, 0.01), shift(B, 0.01));
    expect(route.source).toBe('osrm');
    expect(route.coords).toHaveLength(3);
    expect(route.distanceKm).toBe(124);
    expect(route.durationMinutes).toBe(165);
    expect(route.isApproximate).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toContain('routed-car');
  });

  it('falls back to a straight line with no ETA when routing fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const route = await resolveRoute('bike', shift(A, 0.02), shift(B, 0.02));
    expect(route.source).toBe('straight');
    expect(route.coords).toHaveLength(2);
    expect(route.durationMinutes).toBeNull();
    expect(route.isApproximate).toBe(true);
  });

  it('falls back when the service returns no route', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) });
    const route = await resolveRoute('car', shift(A, 0.03), shift(B, 0.03));
    expect(route.source).toBe('straight');
  });

  it('draws flights as a great-circle arc without any network call', async () => {
    const route = await resolveRoute('flight', shift(A, 0.04), { latitude: 28.56, longitude: 77.1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(route.source).toBe('geodesic');
    expect(route.coords.length).toBeGreaterThan(10);
    expect(route.durationIsEstimate).toBe(true);
  });

  it('draws train legs as an approximate curve with an estimated ETA when no transit data exists', async () => {
    const route = await resolveRoute('train', shift(A, 0.05), shift(B, 0.05));
    expect(route.source).toBe('curve');
    expect(route.isApproximate).toBe(true);
    expect(route.durationIsEstimate).toBe(true);
    expect(route.durationMinutes).toBeGreaterThan(0);
  });

  it('serves a repeated request from cache', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ geometry: '_p~iF~ps|U_ulLnnqC', distance: 1000, duration: 60 }] }),
    });
    const a = shift(A, 0.06);
    const b = shift(B, 0.06);
    await resolveRoute('car', a, b);
    await resolveRoute('car', a, b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
