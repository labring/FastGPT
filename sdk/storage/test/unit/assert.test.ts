import { describe, expect, it } from 'vitest';
import { InvalidStorageObjectKeyError } from '../../src/errors';
import {
  MAX_STORAGE_OBJECT_KEY_UTF8_BYTES,
  assertRequiredStorageObjectPrefix,
  assertStorageObjectKey,
  assertStorageObjectKeys,
  assertStorageObjectPrefix,
  collectStorageObjectKeyViolations
} from '../../src/assert';

const expectInvalidKey = ({
  value,
  reason,
  field = 'key'
}: {
  value: unknown;
  reason: InvalidStorageObjectKeyError['reason'];
  field?: string;
}) => {
  try {
    assertStorageObjectKey(value, field);
    throw new Error('Expected key validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidStorageObjectKeyError);
    expect(error).toMatchObject({ reason, field });
  }
};

describe('storage object key validation', () => {
  it.each([
    'folder name/+ # & % ?/\u6587\u4ef6-\ud83d\ude00.txt',
    'folder/.hidden',
    'folder/..backup',
    'folder/trailing/'
  ])('accepts portable URL-sensitive and Unicode key %j', (key) => {
    expect(() => assertStorageObjectKey(key)).not.toThrow();
  });

  it('accepts exactly 800 UTF-8 bytes, including multibyte characters', () => {
    const asciiKey = 'a'.repeat(MAX_STORAGE_OBJECT_KEY_UTF8_BYTES);
    const unicodeKey = `${'\u4e2d'.repeat(265)}abcde`;

    expect(Buffer.byteLength(asciiKey)).toBe(800);
    expect(Buffer.byteLength(unicodeKey)).toBe(800);
    expect(() => assertStorageObjectKey(asciiKey)).not.toThrow();
    expect(() => assertStorageObjectKey(unicodeKey)).not.toThrow();
  });

  it('rejects 801 UTF-8 bytes even when the JavaScript string is shorter', () => {
    const key = `${'\u4e2d'.repeat(266)}abc`;

    expect(key.length).toBeLessThan(801);
    expect(Buffer.byteLength(key)).toBe(801);
    expectInvalidKey({ value: key, reason: 'too_long' });
  });

  it.each([
    [undefined, 'invalid_type'],
    [123, 'invalid_type'],
    ['', 'empty'],
    ['bad\ud800key', 'invalid_unicode'],
    ['bad\udcffkey', 'invalid_unicode'],
    ['/leading', 'leading_slash'],
    ['folder\\file', 'backslash'],
    ['folder//file', 'empty_path_segment'],
    ['folder\0file', 'control_character'],
    ['folder\nfile', 'control_character'],
    ['folder\u007ffile', 'control_character']
  ] as const)('rejects non-portable key %j as %s', (value, reason) => {
    expectInvalidKey({ value, reason });
  });

  it.each(['.', '..', './file', 'folder/./file', 'folder/../file', 'folder/ .. /file'])(
    'rejects dot path segment in %j',
    (key) => {
      expectInvalidKey({ value: key, reason: 'dot_path_segment' });
    }
  );

  it.each(['\u0018', '\u0019', '\u001a', '\u001b'])(
    'rejects COS-incompatible control character U+%s',
    (character) => {
      expectInvalidKey({ value: `folder/${character}/file`, reason: 'control_character' });
    }
  );

  it('reports the first invalid batch item and validates the full batch before callers mutate', () => {
    try {
      assertStorageObjectKeys(['valid/first', 'invalid//second', 'valid/third']);
      throw new Error('Expected key validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStorageObjectKeyError);
      expect(error).toMatchObject({
        field: 'keys[1]',
        reason: 'empty_path_segment'
      });
    }
  });

  it('rejects a non-array batch with the structured key error', () => {
    try {
      assertStorageObjectKeys('not-an-array');
      throw new Error('Expected key validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStorageObjectKeyError);
      expect(error).toMatchObject({ field: 'keys', reason: 'invalid_type' });
    }
  });

  it('rejects sparse arrays instead of skipping missing entries', () => {
    const keys = new Array<string>(2);
    keys[1] = 'valid.txt';

    try {
      assertStorageObjectKeys(keys);
      throw new Error('Expected key validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStorageObjectKeyError);
      expect(error).toMatchObject({ field: 'keys[0]', reason: 'invalid_type' });
    }
  });

  it('allows omitted and empty list prefixes but validates non-empty prefixes', () => {
    expect(() => assertStorageObjectPrefix(undefined)).not.toThrow();
    expect(() => assertStorageObjectPrefix('')).not.toThrow();
    expect(() => assertStorageObjectPrefix('folder name/\u4e2d\u6587/')).not.toThrow();

    try {
      assertStorageObjectPrefix('invalid//prefix');
      throw new Error('Expected prefix validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStorageObjectKeyError);
      expect(error).toMatchObject({ field: 'prefix', reason: 'empty_path_segment' });
    }
  });

  it.each(['', '   '])('rejects required delete prefix %j', (prefix) => {
    expect(() => assertRequiredStorageObjectPrefix(prefix)).toThrow('Prefix is required');
  });

  it('accepts a valid required delete prefix', () => {
    expect(() => assertRequiredStorageObjectPrefix('team/files/')).not.toThrow();
  });
});

describe('collectStorageObjectKeyViolations', () => {
  it('returns an empty list for a valid key', () => {
    expect(collectStorageObjectKeyViolations('dataset/team/file.txt')).toEqual([]);
  });

  it('collects every violation instead of stopping at the first reason', () => {
    expect(collectStorageObjectKeyViolations('chat\\legacy/../escape.txt')).toEqual([
      'backslash',
      'dot_path_segment'
    ]);
  });

  it('keeps assertStorageObjectKey throwing the first violation in fixed order', () => {
    expect(() => assertStorageObjectKey('chat\\legacy/../escape.txt')).toThrowError(
      expect.objectContaining({ reason: 'backslash' })
    );
  });

  it('returns only the base violation for non-string, empty and malformed unicode keys', () => {
    expect(collectStorageObjectKeyViolations(123)).toEqual(['invalid_type']);
    expect(collectStorageObjectKeyViolations('')).toEqual(['empty']);
    expect(collectStorageObjectKeyViolations('bad\ud800key')).toEqual(['invalid_unicode']);
  });

  it('collects control characters together with later path segment violations', () => {
    expect(collectStorageObjectKeyViolations('chat\\legacy/\r\n../escape.txt')).toEqual([
      'backslash',
      'control_character',
      'dot_path_segment'
    ]);
  });
});
