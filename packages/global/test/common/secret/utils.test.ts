import { describe, it, expect } from 'vitest';
import { isSecretValue } from '@fastgpt/global/common/secret/utils';

describe('isSecretValue', () => {
  it('should return true for object with truthy secret', () => {
    expect(isSecretValue({ secret: 'token' })).toBe(true);
    expect(isSecretValue({ secret: true })).toBe(true);
  });

  it('should return false for non-object values', () => {
    const cases = [null, undefined, 'secret', 1, false];
    cases.forEach((val) => expect(isSecretValue(val)).toBe(false));
  });

  it('should return false for empty or missing secret', () => {
    const cases = [{}, { secret: '' }, { secret: 0 }, { secret: null }, []];
    cases.forEach((val) => expect(isSecretValue(val)).toBe(false));
  });
});
