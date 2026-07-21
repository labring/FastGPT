import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisHashCapability } from '@fastgpt/service/common/redis/capability/hash';
import { asRedisLogicalKey } from '@fastgpt/service/common/redis/runtime/keyspace';

const createClient = () => ({ del: vi.fn(), hgetall: vi.fn() });
const createScripts = () => ({
  appendString: vi.fn(),
  setHashFields: vi.fn(),
  initializeVersion: vi.fn(),
  renewLease: vi.fn(),
  releaseLease: vi.fn()
});

describe('createRedisHashCapability', () => {
  const key = asRedisLogicalKey('session:user');
  let client: ReturnType<typeof createClient>;
  let scripts: ReturnType<typeof createScripts>;

  beforeEach(() => {
    client = createClient();
    scripts = createScripts();
  });

  it('reads hash fields and preserves an empty hash miss', async () => {
    client.hgetall.mockResolvedValueOnce({ userId: 'u1' }).mockResolvedValueOnce({});
    const capability = createRedisHashCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.getAll(key)).resolves.toEqual({ userId: 'u1' });
    await expect(capability.getAll(key)).resolves.toEqual({});
    expect(client.hgetall).toHaveBeenCalledWith('fastgpt:session:user');
  });

  it.each([null, [], { field: 1 }])('rejects malformed HGETALL response %#', async (result) => {
    client.hgetall.mockResolvedValue(result);
    const capability = createRedisHashCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.getAll(key)).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE' });
  });

  it('delegates atomic field and TTL writes to the script registry', async () => {
    scripts.setHashFields.mockResolvedValue(undefined);
    const capability = createRedisHashCapability({
      getClient: () => client as any,
      scripts
    });
    const fields = { userId: 'u1', teamId: 't1' };

    await expect(capability.setFields({ key, fields, ttlMs: 500 })).resolves.toBeUndefined();
    expect(scripts.setHashFields).toHaveBeenCalledWith({ key, fields, ttlMs: 500 });
  });

  it.each([
    [1, true],
    [0, false]
  ])('maps hash delete count %s', async (deleted, expected) => {
    client.del.mockResolvedValue(deleted);
    const capability = createRedisHashCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.delete(key)).resolves.toBe(expected);
  });

  it('rejects malformed hash delete response', async () => {
    client.del.mockResolvedValue(2);
    const capability = createRedisHashCapability({
      getClient: () => client as any,
      scripts
    });

    await expect(capability.delete(key)).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE' });
  });
});
