import { CONSENT_CATEGORIES, CURRENT_POLICY_VERSION, recordConsent } from './consent';

const mockRecordConsent = jest.fn();

jest.mock('@/services/api', () => ({
  apiService: { recordConsent: (...args: unknown[]) => mockRecordConsent(...args) },
}));

const mockWarn = jest.fn();
jest.mock('@/lib/logger', () => ({ logger: { warn: (...args: unknown[]) => mockWarn(...args) } }));

beforeEach(() => {
  mockRecordConsent.mockReset();
  mockWarn.mockReset();
});

describe('CONSENT_CATEGORIES', () => {
  it('covers every permission this app actually requests, and nothing else (no KYC — removed in §12.1)', () => {
    expect(CONSENT_CATEGORIES).toEqual(['LOCATION', 'CAMERA', 'PHOTOS', 'NOTIFICATIONS']);
  });
});

describe('recordConsent', () => {
  it('calls the API with the category, the decision, and the current policy version', () => {
    mockRecordConsent.mockResolvedValue({ id: '1' });
    recordConsent('LOCATION', true);
    expect(mockRecordConsent).toHaveBeenCalledWith('LOCATION', true, CURRENT_POLICY_VERSION);
  });

  it('is fire-and-forget — it does not return a promise the caller must await', () => {
    mockRecordConsent.mockResolvedValue({ id: '1' });
    const result = recordConsent('CAMERA', false);
    expect(result).toBeUndefined();
  });

  it('never throws when the API call rejects — only logs a warning', async () => {
    mockRecordConsent.mockRejectedValue(new Error('network down'));
    expect(() => recordConsent('NOTIFICATIONS', true)).not.toThrow();
    // Let the rejected promise's .catch() microtask run.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('NOTIFICATIONS=true'),
      expect.any(Error),
    );
  });
});
