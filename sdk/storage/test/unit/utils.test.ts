import { describe, expect, it } from 'vitest';
import { encodeObjectKeyPath } from '../../src/utils';

describe('encodeObjectKeyPath', () => {
  it.each([
    ['', ''],
    ['folder/file.txt', 'folder/file.txt'],
    ['folder name/file #+&.txt', 'folder%20name/file%20%23%2B%26.txt'],
    ['literal/%2F/\u6587\u4ef6.txt', 'literal/%252F/%E6%96%87%E4%BB%B6.txt'],
    ['/leading//empty/', '/leading//empty/']
  ])('encodes %j as an object URL path', (key, expected) => {
    expect(encodeObjectKeyPath(key)).toBe(expected);
  });
});
