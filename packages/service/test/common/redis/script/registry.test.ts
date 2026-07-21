import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asRedisLogicalKey } from '@fastgpt/service/common/redis/runtime/keyspace';
import { createRedisScriptRegistry } from '@fastgpt/service/common/redis/script';

const createClient = () => ({
  eval: vi.fn(),
  evalsha: vi.fn()
});

describe('createRedisScriptRegistry', () => {
  const key = asRedisLogicalKey('cache:test');
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    client = createClient();
  });

  it('falls back to EVAL only for NOSCRIPT and encodes append TTL', async () => {
    client.evalsha.mockRejectedValueOnce('NOSCRIPT missing script');
    client.eval.mockResolvedValueOnce(5);
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });

    await expect(scripts.appendString({ key, value: 'hello', ttlMs: 1_000 })).resolves.toBe(5);

    expect(client.evalsha).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'fastgpt:cache:test',
      'hello',
      '1000'
    );
    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('APPEND'"),
      1,
      'fastgpt:cache:test',
      'hello',
      '1000'
    );
  });

  it('uses EVALSHA without fallback when the script cache is warm', async () => {
    client.evalsha.mockResolvedValueOnce(0);
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });

    await expect(scripts.appendString({ key, value: '' })).resolves.toBe(0);

    expect(client.eval).not.toHaveBeenCalled();
    expect(client.evalsha).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'fastgpt:cache:test',
      '',
      '0'
    );
  });

  it('does not execute source after non-NOSCRIPT failures', async () => {
    client.evalsha.mockRejectedValue(new Error('ECONNRESET'));
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });

    await expect(scripts.appendString({ key, value: 'x' })).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
      operation: 'string.append',
      outcome: 'unknown'
    });
    expect(client.evalsha).toHaveBeenCalledTimes(1);
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('does not treat an incidental NOSCRIPT substring as a cache miss', async () => {
    client.evalsha.mockRejectedValue(new Error('ERR value contains NOSCRIPT text'));
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });

    await expect(scripts.appendString({ key, value: 'x' })).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED'
    });
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('encodes hash fields and parses changed field count', async () => {
    client.evalsha.mockResolvedValueOnce(2);
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });

    await expect(
      scripts.setHashFields({ key, fields: { userId: 'u1', isRoot: '0' }, ttlMs: 2_000 })
    ).resolves.toBeUndefined();
    expect(client.evalsha).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'fastgpt:cache:test',
      '2000',
      'userId',
      'u1',
      'isRoot',
      '0'
    );
  });

  it.each([
    [null as any, 'fields must be a record'],
    [[] as any, 'fields must be a record'],
    [{}, 'fields must contain between 1 and 128 entries'],
    [{ '': 'value' }, 'hash field must be a non-empty string'],
    [{ field: 1 as any }, 'hash field values must be strings']
  ])('rejects invalid hash fields %#', (fields, message) => {
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });

    expect(() => scripts.setHashFields({ key, fields })).toThrow(message);
    expect(client.evalsha).not.toHaveBeenCalled();
  });

  it('rejects oversized hashes before Lua unpack', () => {
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });
    const fields = Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [`field-${index}`, 'value'])
    );

    expect(() => scripts.setHashFields({ key, fields })).toThrow(
      'fields must contain between 1 and 128 entries'
    );
  });

  it('initializes a version once and returns an existing version', async () => {
    client.evalsha.mockResolvedValueOnce([1, 'new-version']).mockResolvedValueOnce([0, 'existing']);
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });

    await expect(scripts.initializeVersion({ key, value: 'new-version' })).resolves.toBe(
      'new-version'
    );
    await expect(scripts.initializeVersion({ key, value: 'other' })).resolves.toBe('existing');
  });

  it('renews and releases a lease with strict token checks', async () => {
    client.evalsha.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const scripts = createRedisScriptRegistry({ getClient: () => client as any });

    await expect(scripts.renewLease({ key, token: 'token', ttlMs: 500 })).resolves.toBe(true);
    await expect(scripts.releaseLease({ key, token: 'token' })).resolves.toBe(false);
    expect(client.evalsha.mock.calls[0]).toEqual([
      expect.any(String),
      1,
      'fastgpt:cache:test',
      'token',
      '500'
    ]);
  });

  it.each([
    [
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).appendString({
          key,
          value: 1 as any
        }),
      'value'
    ],
    [
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).appendString({
          key,
          value: 'x',
          ttlMs: 0
        }),
      'ttlMs'
    ],
    [
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).initializeVersion({
          key,
          value: ''
        }),
      'value'
    ],
    [
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).renewLease({
          key,
          token: '',
          ttlMs: 1
        }),
      'token'
    ],
    [
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).renewLease({
          key,
          token: 'token',
          ttlMs: 0
        }),
      'ttlMs'
    ],
    [
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).releaseLease({
          key,
          token: ''
        }),
      'token'
    ]
  ])('rejects invalid script arguments %#', (execute, message) => {
    expect(execute).toThrow(message);
    expect(client.evalsha).not.toHaveBeenCalled();
  });

  it.each([
    [
      'append',
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).appendString({
          key,
          value: 'x'
        }),
      'invalid'
    ],
    [
      'hash',
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).setHashFields({
          key,
          fields: { a: 'b' }
        }),
      -1
    ],
    [
      'version',
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).initializeVersion({
          key,
          value: 'v'
        }),
      [2, 'v']
    ],
    [
      'lease',
      () =>
        createRedisScriptRegistry({ getClient: () => client as any }).renewLease({
          key,
          token: 't',
          ttlMs: 1
        }),
      2
    ]
  ])('rejects invalid %s script response', async (_name, execute, result) => {
    client.evalsha.mockResolvedValueOnce(result);

    await expect(execute()).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE' });
  });
});
