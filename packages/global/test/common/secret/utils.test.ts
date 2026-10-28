import { describe, it, expect } from 'vitest';
import {
  getSecretCipherValue,
  getSecretPlainValue,
  getSecretReferenceValue,
  isSecretValueConfigured,
  normalizeLegacySecretValue,
  parseSecretValue,
  StoreSecretValueTypeApiInputSchema
} from '@fastgpt/global/common/secret/utils';

describe('normalizeLegacySecretValue', () => {
  it.each([
    [{ value: 'plain', secret: 'cipher' }, { value: 'plain' }],
    [{ value: '', secret: 'cipher' }, { secret: 'cipher' }],
    [{ value: undefined, secret: 'cipher' }, { secret: 'cipher' }],
    [{ value: 'plain', secret: undefined }, { value: 'plain' }],
    [{ value: '' }, { value: '' }],
    ['{"value":"","secret":"cipher"}', { secret: 'cipher' }],
    ['{"ref":["node","token"]}', { ref: ['node', 'token'] }]
  ])('normalizes known credential storage values: %j', (value, expected) => {
    expect(normalizeLegacySecretValue(value)).toEqual(expected);
  });

  it.each([
    undefined,
    null,
    false,
    0,
    [],
    'plain',
    '42',
    'null',
    '{invalid',
    '{"payload":true}',
    { value: undefined },
    { value: 1 },
    { secret: false },
    { value: 'plain', secret: 'cipher', business: true }
  ])('preserves unrelated or malformed values: %j', (value) => {
    expect(normalizeLegacySecretValue(value)).toEqual(value);
  });
});

describe('parseSecretValue', () => {
  it.each([
    { value: '' },
    { secret: 'cipher' },
    { ref: ['node', 'token'] },
    {
      ref: [
        ['node', 'token'],
        ['other', 'token']
      ]
    }
  ])('accepts canonical wrappers: %j', (value) => {
    expect(parseSecretValue(value)).toEqual(value);
  });

  it.each([
    {},
    'plain',
    { ref: [] },
    { ref: ['node'] },
    { ref: ['', 'token'] },
    { ref: ['node', 'token'], value: 'plain' },
    { ref: ['node', 'token'], secret: 'cipher' },
    { value: 'plain', business: true }
  ])('rejects invalid wrappers consistently across all getters: %j', (value) => {
    expect(parseSecretValue(value)).toBeUndefined();
    expect(getSecretPlainValue(value)).toBeUndefined();
    expect(getSecretCipherValue(value)).toBeUndefined();
    expect(getSecretReferenceValue(value)).toBeUndefined();
    expect(isSecretValueConfigured(value)).toBe(false);
  });

  it('uses the same legacy precedence at API boundaries and in field getters', () => {
    const legacy = { value: 'plain', secret: 'cipher' };
    expect(parseSecretValue(legacy)).toEqual({ value: 'plain' });
    expect(getSecretPlainValue(legacy)).toBe('plain');
    expect(getSecretCipherValue(legacy)).toBeUndefined();
    expect(StoreSecretValueTypeApiInputSchema.parse({ token: legacy })).toEqual({
      token: parseSecretValue(legacy)
    });
  });
});

describe('isSecretValueConfigured', () => {
  it.each([
    [{ value: '' }, false],
    [{ secret: '' }, false],
    [{ value: 'plain' }, true],
    [{ secret: 'cipher' }, true],
    [{ ref: ['node', 'token'] }, true],
    [{ value: '', secret: 'cipher' }, true]
  ])('judges configured sources without decrypting them: %j', (value, expected) => {
    expect(isSecretValueConfigured(value)).toBe(expected);
  });
});

describe('credential field getters', () => {
  it('only exposes the field selected by the shared parser', () => {
    expect(getSecretPlainValue({ value: '' })).toBe('');
    expect(getSecretCipherValue({ secret: '' })).toBe('');
    expect(getSecretPlainValue({ secret: 'cipher' })).toBeUndefined();
    expect(getSecretCipherValue({ value: 'plain' })).toBeUndefined();
    expect(getSecretReferenceValue({ value: 'plain' })).toBeUndefined();
    expect(getSecretReferenceValue({ ref: ['node', 'token'] })).toEqual(['node', 'token']);
  });
});
