import { describe, it, expect } from 'vitest';
import {
  getSecretCipherValue,
  getSecretPlainValue,
  getSecretReferenceValue,
  getSecretValueField,
  hasSecretValueField,
  isSecretCipherValue,
  isSecretPlainValue,
  isSecretReferenceValue,
  isSecretValueLike
} from '@fastgpt/global/common/secret/utils';

describe('isSecretValueLike', () => {
  it('recognizes canonical static and reference wrappers', () => {
    expect(isSecretValueLike({ value: '' })).toBe(true);
    expect(isSecretValueLike({ secret: '' })).toBe(true);
    expect(isSecretValueLike({ ref: ['node-1', 'token'] })).toBe(true);
  });

  it('rejects non-wrapper values', () => {
    const cases = [null, undefined, 'secret', 1, false, {}, [], ['node-1', 'token']];
    cases.forEach((val) => expect(isSecretValueLike(val)).toBe(false));
  });
});

describe('secret value helpers', () => {
  it('reads wrapper fields without confusing ordinary objects', () => {
    const value = { value: 'plain', secret: 'cipher' };

    expect(hasSecretValueField(value, 'value')).toBe(true);
    expect(hasSecretValueField(value, 'secret')).toBe(true);
    expect(getSecretValueField(value, 'value')).toBe('plain');
    expect(getSecretPlainValue(value)).toBe('plain');
    expect(getSecretCipherValue(value)).toBe('cipher');
    expect(isSecretPlainValue(value)).toBe(true);
    expect(isSecretCipherValue(value)).toBe(true);
    expect(getSecretPlainValue({ value: 1 })).toBeUndefined();
    expect(getSecretValueField({ other: 'value' }, 'value')).toBeUndefined();
  });

  it('validates and extracts reference wrappers', () => {
    const value = { ref: ['node-1', 'token'] as [string, string] };

    expect(isSecretReferenceValue(value)).toBe(true);
    expect(getSecretReferenceValue(value)).toEqual(['node-1', 'token']);
    expect(isSecretReferenceValue({ ref: [] })).toBe(false);
    expect(getSecretReferenceValue({ ref: [] })).toBeUndefined();
  });
});
