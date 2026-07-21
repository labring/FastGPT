import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisStringCapability } from '@fastgpt/service/common/redis/capability/string';
import { asRedisLogicalKey } from '@fastgpt/service/common/redis/runtime/keyspace';

const createClient = () => ({
  del: vi.fn(),
  get: vi.fn(),
  pttl: vi.fn(),
  set: vi.fn()
});

const createScripts = () => ({
  appendString: vi.fn(),
  setHashFields: vi.fn(),
  initializeVersion: vi.fn(),
  renewLease: vi.fn(),
  releaseLease: vi.fn()
});

describe('createRedisStringCapability', () => {
  const key = asRedisLogicalKey('cache:string');
  let client: ReturnType<typeof createClient>;
  let scripts: ReturnType<typeof createScripts>;

  beforeEach(() => {
    client = createClient();
    scripts = createScripts();
  });

  it('reads a logical key through the physical command port', async () => {
    client.get.mockResolvedValueOnce('value').mockResolvedValueOnce(null);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.get(key)).resolves.toBe('value');
    await expect(capability.get(key)).resolves.toBeNull();
    expect(client.get).toHaveBeenCalledWith('fastgpt:cache:string');
  });

  it('rejects an unsupported GET response', async () => {
    client.get.mockResolvedValue(1);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.get(key)).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE' });
  });

  it('sets persistent and expiring values with strict OK responses', async () => {
    client.set.mockResolvedValue('OK');
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.set({ key, value: '' })).resolves.toBeUndefined();
    await expect(capability.set({ key, value: 'value', ttlMs: 500 })).resolves.toBeUndefined();
    expect(client.set.mock.calls).toEqual([
      ['fastgpt:cache:string', ''],
      ['fastgpt:cache:string', 'value', 'PX', 500]
    ]);
  });

  it.each([
    [{ key, value: 1 as any }, 'value must be a string'],
    [{ key, value: 'value', ttlMs: 0 }, 'ttlMs must be a positive safe integer']
  ])('rejects invalid set input %#', (input, message) => {
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    expect(() => capability.set(input)).toThrow(message);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('rejects unsupported SET responses without retrying', async () => {
    client.set.mockResolvedValue(null);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.set({ key, value: 'value' })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
    expect(client.set).toHaveBeenCalledTimes(1);
  });

  it('maps SET NX responses to acquisition state with optional TTL', async () => {
    client.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.setIfAbsent({ key, value: 'first' })).resolves.toBe(true);
    await expect(capability.setIfAbsent({ key, value: 'second', ttlMs: 100 })).resolves.toBe(false);
    expect(client.set.mock.calls).toEqual([
      ['fastgpt:cache:string', 'first', 'NX'],
      ['fastgpt:cache:string', 'second', 'PX', 100, 'NX']
    ]);
  });

  it.each([
    [{ key, value: 1 as any }, 'value must be a string'],
    [{ key, value: 'value', ttlMs: -1 }, 'ttlMs must be a positive safe integer']
  ])('rejects invalid SET NX input %#', (input, message) => {
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    expect(() => capability.setIfAbsent(input)).toThrow(message);
  });

  it('rejects unsupported SET NX responses', async () => {
    client.set.mockResolvedValue('QUEUED');
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.setIfAbsent({ key, value: 'value' })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
  });

  it.each([
    [1, true],
    [0, false]
  ])('maps delete count %s to %s', async (deleted, expected) => {
    client.del.mockResolvedValue(deleted);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.delete(key)).resolves.toBe(expected);
    expect(client.del).toHaveBeenCalledWith('fastgpt:cache:string');
  });

  it('rejects invalid delete counts', async () => {
    client.del.mockResolvedValue(2);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.delete(key)).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE' });
  });

  it.each([
    [-2, { state: 'missing' }],
    [-1, { state: 'persistent' }],
    [0, { state: 'expiring', ttlMs: 0 }],
    [500, { state: 'expiring', ttlMs: 500 }]
  ])('maps PTTL response %s', async (ttlMs, expected) => {
    client.pttl.mockResolvedValue(ttlMs);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.getTtl(key)).resolves.toEqual(expected);
  });

  it('rejects unsupported PTTL responses', async () => {
    client.pttl.mockResolvedValue(-3);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.getTtl(key)).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE' });
  });

  it('delegates atomic append to the script registry', async () => {
    scripts.appendString.mockResolvedValue(10);
    const capability = createRedisStringCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.append({ key, value: 'chunk', ttlMs: 1_000 })).resolves.toBe(10);
    expect(scripts.appendString).toHaveBeenCalledWith({ key, value: 'chunk', ttlMs: 1_000 });
  });
});
