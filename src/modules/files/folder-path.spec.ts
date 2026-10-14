import { folderPath } from './folder-path.js';

describe('Folder paths', () => {
  it.each([
    undefined,
    null,
    123,
    {},
    '',
    '/',
    'a/../b',
    'a/./b',
    'a\\b',
    'a\nb',
    'x'.repeat(201),
  ])('rejects invalid folder %j', (value) => {
    expect(() => folderPath(value)).toThrow();
  });
  it('allows the legacy root only for reads', () => {
    expect(folderPath('', true)).toBe('');
    expect(folderPath(undefined, true)).toBe('');
  });
  it('preserves names and normalizes separators', () => {
    expect(folderPath(' / Família // Férias / ')).toBe('Família/Férias');
  });
});
