import { describe, expect, it } from 'vitest';
import {
  getFileUrlIdentity,
  isAbsoluteHttpUrl,
  selectFileInputs
} from '@fastgpt/service/core/chat/file/utils';

describe('isAbsoluteHttpUrl', () => {
  it.each([
    ['https://files.example.com/a.pdf', true],
    ['http://files.example.com/a.pdf', true],
    ['/api/system/file/d/token', false],
    ['//files.example.com/a.pdf', false],
    ['file:///tmp/a.pdf', false],
    ['data:text/plain,a', false],
    ['ws://files.example.com/a.pdf', false],
    ['http://[invalid', false],
    [undefined, false]
  ])('validates %s', (url, expected) => expect(isAbsoluteHttpUrl(url)).toBe(expected));
});

describe('getFileUrlIdentity', () => {
  it('normalizes HTTP identity without removing signed query parameters', () => {
    expect(getFileUrlIdentity('https://EXAMPLE.com:443/file?signature=one#part')).toBe(
      'external:https://example.com/file?signature=one'
    );
    expect(getFileUrlIdentity('https://example.com/file?signature=two')).not.toBe(
      getFileUrlIdentity('https://example.com/file?signature=one')
    );
    expect(getFileUrlIdentity('chat/private.pdf')).toBe('chat/private.pdf');
  });
});

describe('selectFileInputs', () => {
  it.each([0, -1, 1, 1.9, 5])(
    'deduplicates before enforcing limit %s and preserves input objects',
    (maxFiles) => {
      const first = { id: 'one' };
      const second = { id: 'two' };
      const files = [first, { id: 'one' }, second];
      const result = selectFileInputs({ files, maxFiles, getIdentity: (file) => file.id });
      expect(result).toEqual([first, second].slice(0, Math.max(0, Math.floor(maxFiles))));
      if (result.length) expect(result[0]).toBe(first);
      expect(files).toHaveLength(3);
    }
  );
});
