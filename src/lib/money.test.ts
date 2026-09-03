import { formatINR, formatINRCompact, parseMoney } from './money';

describe('parseMoney', () => {
  it('parses a decimal string as sent over the wire', () => {
    expect(parseMoney('8500.00')).toBe(8500);
  });

  it('parses a number', () => {
    expect(parseMoney(8500)).toBe(8500);
  });

  it('returns null for null, undefined, and empty string', () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney('')).toBeNull();
  });

  it('returns null for a non-numeric string rather than NaN', () => {
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('formatINR', () => {
  it('formats a wire string as whole rupees with Indian grouping', () => {
    expect(formatINR('8500.00')).toBe('₹8,500');
  });

  it('formats lakh-scale amounts with lakh grouping, not thousands grouping', () => {
    expect(formatINR('150000')).toBe('₹1,50,000');
  });

  it('shows paise when requested', () => {
    expect(formatINR('8500.5', { showPaise: true })).toBe('₹8,500.50');
  });

  it('falls back to the em-dash for a missing amount', () => {
    expect(formatINR(null)).toBe('—');
    expect(formatINR(undefined)).toBe('—');
  });

  it('honors a custom fallback', () => {
    expect(formatINR('not-a-number', { fallback: 'N/A' })).toBe('N/A');
  });

  it('formats zero rather than treating it as missing', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR('0')).toBe('₹0');
  });

  it('formats negative amounts', () => {
    expect(formatINR(-500)).toBe('-₹500');
  });
});

describe('formatINRCompact', () => {
  it('renders thousands as K', () => {
    expect(formatINRCompact(8500)).toBe('₹8.5K');
  });

  it('renders lakhs as L', () => {
    expect(formatINRCompact(150000)).toBe('₹1.5L');
  });

  it('renders crores as Cr', () => {
    expect(formatINRCompact(25000000)).toBe('₹2.5Cr');
  });

  it('leaves sub-thousand amounts formatted as plain rupees', () => {
    expect(formatINRCompact(850)).toBe('₹850');
  });

  it('trims a trailing .0', () => {
    expect(formatINRCompact(100000)).toBe('₹1L');
  });

  it('falls back to the em-dash for a missing amount', () => {
    expect(formatINRCompact(null)).toBe('—');
  });
});
