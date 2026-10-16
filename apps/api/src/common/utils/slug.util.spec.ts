import { MAX_SLUG_LENGTH, slugify } from './slug.util.js';

describe('slugify', () => {
  it('lowercases and hyphenates a simple name', () => {
    expect(slugify('Home Decor')).toBe('home-decor');
  });

  it('trims surrounding and repeated whitespace', () => {
    expect(slugify('  Fresh   Produce  ')).toBe('fresh-produce');
  });

  it('strips punctuation and symbols', () => {
    expect(slugify('Café & Pastries!')).toBe('cafe-pastries');
  });

  it('removes diacritics via unicode normalization', () => {
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
  });

  it('collapses leading and trailing separators', () => {
    expect(slugify('__--Kids--__')).toBe('kids');
  });

  it('returns an empty string when no alphanumeric characters remain', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('caps the slug length and does not end with a hyphen', () => {
    const slug = slugify('a'.repeat(MAX_SLUG_LENGTH + 50));

    expect(slug).toHaveLength(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });
});
