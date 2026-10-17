import { isPhoneLike, normalizePhone, PHONE_PATTERN } from './phone.util.js';

describe('normalizePhone', () => {
  it('strips spaces, dashes, parentheses, and dots', () => {
    expect(normalizePhone('+880 (17) 1234.5678')).toBe('+8801712345678');
    expect(normalizePhone('880-1712-345678')).toBe('8801712345678');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizePhone('  01712-345678  ')).toBe('01712345678');
  });

  it('converts a leading 00 international prefix to +', () => {
    expect(normalizePhone('008801712345678')).toBe('+8801712345678');
  });

  it('keeps a single leading plus', () => {
    expect(normalizePhone('+1 (202) 555-0193')).toBe('+12025550193');
  });

  it('drops non-digit characters that are not separators', () => {
    expect(normalizePhone('tel:01712x345678')).toBe('01712345678');
  });

  it('is idempotent', () => {
    const once = normalizePhone('+1 (202) 555-0193');

    expect(normalizePhone(once)).toBe(once);
  });

  it('returns an empty string when no digits remain', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('   ')).toBe('');
    expect(normalizePhone('+++')).toBe('+');
  });
});

describe('isPhoneLike', () => {
  it('accepts digits with phone punctuation', () => {
    expect(isPhoneLike('+880 1712-345678')).toBe(true);
    expect(isPhoneLike('(017) 1234.5678')).toBe(true);
  });

  it('rejects values containing letters', () => {
    expect(isPhoneLike('John 1712')).toBe(false);
    expect(isPhoneLike('abc')).toBe(false);
  });
});

describe('PHONE_PATTERN', () => {
  it('accepts 6 to 15 digits with an optional leading plus', () => {
    expect(PHONE_PATTERN.test('123456')).toBe(true);
    expect(PHONE_PATTERN.test('+8801712345678')).toBe(true);
  });

  it('rejects too few or too many digits and stray characters', () => {
    expect(PHONE_PATTERN.test('12345')).toBe(false);
    expect(PHONE_PATTERN.test('+1234567890123456')).toBe(false);
    expect(PHONE_PATTERN.test('+')).toBe(false);
    expect(PHONE_PATTERN.test('')).toBe(false);
    expect(PHONE_PATTERN.test('123-456')).toBe(false);
  });
});
