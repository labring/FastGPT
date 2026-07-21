import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisCounterCapability } from '@fastgpt/service/common/redis/capability/counter';
import { asRedisLogicalKey } from '@fastgpt/service/common/redis/runtime/keyspace';

const createClient = () => ({ incrby: vi.fn(), incrbyfloat: vi.fn() });

describe('createRedisCounterCapability', () => {
  const key = asRedisLogicalKey('counter:test');
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    client = createClient();
  });

  it('increments integers with a default or explicit amount', async () => {
    client.incrby.mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    const capability = createRedisCounterCapability({ getClient: () => client as any });

    await expect(capability.increment({ key })).resolves.toBe(1);
    await expect(capability.increment({ key, amount: 3 })).resolves.toBe(4);
    expect(client.incrby.mock.calls).toEqual([
      ['fastgpt:counter:test', 1],
      ['fastgpt:counter:test', 3]
    ]);
  });

  it.each([1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid integer amount %s',
    (amount) => {
      const capability = createRedisCounterCapability({ getClient: () => client as any });

      expect(() => capability.increment({ key, amount })).toThrow('amount must be a safe integer');
      expect(client.incrby).not.toHaveBeenCalled();
    }
  );

  it('rejects an unsafe INCRBY response', async () => {
    client.incrby.mockResolvedValue(Number.MAX_SAFE_INTEGER + 1);
    const capability = createRedisCounterCapability({ getClient: () => client as any });

    await expect(capability.increment({ key })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
  });

  it('increments finite floating-point values and parses Redis strings', async () => {
    client.incrbyfloat.mockResolvedValue('1.25');
    const capability = createRedisCounterCapability({ getClient: () => client as any });

    await expect(capability.incrementFloat({ key, amount: 0.25 })).resolves.toBe(1.25);
    expect(client.incrbyfloat).toHaveBeenCalledWith('fastgpt:counter:test', 0.25);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid float amount %s', (amount) => {
    const capability = createRedisCounterCapability({ getClient: () => client as any });

    expect(() => capability.incrementFloat({ key, amount })).toThrow(
      'amount must be a finite number'
    );
  });

  it.each([1, 'not-a-number'])('rejects malformed INCRBYFLOAT response %#', async (result) => {
    client.incrbyfloat.mockResolvedValue(result);
    const capability = createRedisCounterCapability({ getClient: () => client as any });

    await expect(capability.incrementFloat({ key, amount: 1 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
  });
});
