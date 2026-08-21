import { describe, expect, it } from 'vitest';
import { parseOptionalTtlMs, parsePositiveInteger } from '@fastgpt/dal/redis/runtime/validation';

describe('parsePositiveInteger', () => {
  it.each([1, 10_000, Number.MAX_SAFE_INTEGER])('returns strict safe integer %s', (value) => {
    expect(parsePositiveInteger({ value, operation: 'test.operation', field: 'count' })).toBe(
      value
    );
  });

  it.each([
    undefined,
    null,
    '1',
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1
  ])('rejects invalid value %s without exposing Zod issues', (value) => {
    expect(() =>
      parsePositiveInteger({ value, operation: 'test.operation', field: 'count' })
    ).toThrowError(
      expect.objectContaining({
        code: 'REDIS_INVALID_ARGUMENT',
        operation: 'test.operation',
        outcome: 'not-started',
        message: 'count must be a positive safe integer'
      })
    );
  });

  it('accepts the configured maximum and rejects larger values with a stable message', () => {
    expect(
      parsePositiveInteger({
        value: 100,
        operation: 'scan.iterate',
        field: 'batchSize',
        maximum: 100
      })
    ).toBe(100);

    expect(() =>
      parsePositiveInteger({
        value: 101,
        operation: 'scan.iterate',
        field: 'batchSize',
        maximum: 100
      })
    ).toThrow('batchSize must be a positive safe integer no greater than 100');
  });
});

describe('parseOptionalTtlMs', () => {
  it('preserves undefined and returns a valid TTL', () => {
    expect(parseOptionalTtlMs({ ttlMs: undefined, operation: 'string.set' })).toBeUndefined();
    expect(parseOptionalTtlMs({ ttlMs: 500, operation: 'string.set' })).toBe(500);
  });

  it('strictly rejects a non-number TTL with the Redis error contract', () => {
    expect(() => parseOptionalTtlMs({ ttlMs: '500', operation: 'string.set' })).toThrowError(
      expect.objectContaining({
        code: 'REDIS_INVALID_ARGUMENT',
        operation: 'string.set',
        message: 'ttlMs must be a positive safe integer'
      })
    );
  });
});
