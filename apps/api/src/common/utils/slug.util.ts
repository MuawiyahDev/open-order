export const MAX_SLUG_LENGTH = 120;

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const LEADING_OR_TRAILING_HYPHENS = /^-+|-+$/g;

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(LEADING_OR_TRAILING_HYPHENS, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(LEADING_OR_TRAILING_HYPHENS, '');
}
