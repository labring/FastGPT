import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisScanCapability } from '@fastgpt/service/common/redis/capability/scan';
import { asRedisLogicalKey } from '@fastgpt/service/common/redis/runtime/keyspace';

const createClient = () => ({ scan: vi.fn(), unlink: vi.fn() });

describe('createRedisScanCapability', () => {
  const prefix = asRedisLogicalKey('session:user');
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    client = createClient();
  });

  it('iterates non-empty logical key batches until cursor zero', async () => {
    client.scan
      .mockResolvedValueOnce(['7', ['fastgpt:session:user:a', 'fastgpt:session:user:b']])
      .mockResolvedValueOnce(['0', []]);
    const capability = createRedisScanCapability({ getClient: () => client as any });
    const batches: string[][] = [];

    for await (const batch of capability.iterate({ prefix, batchSize: 25 })) {
      batches.push(batch);
    }

    expect(batches).toEqual([['session:user:a', 'session:user:b']]);
    expect(client.scan.mock.calls).toEqual([
      ['0', 'MATCH', 'fastgpt:session:user:*', 'COUNT', 25],
      ['7', 'MATCH', 'fastgpt:session:user:*', 'COUNT', 25]
    ]);
  });

  it.each([0, 10_001, 1.5])('rejects invalid scan batch size %s', async (batchSize) => {
    const capability = createRedisScanCapability({ getClient: () => client as any });

    const consume = async () => {
      for await (const _batch of capability.iterate({ prefix, batchSize })) {
        // no-op
      }
    };
    await expect(consume()).rejects.toMatchObject({ code: 'REDIS_INVALID_ARGUMENT' });
    expect(client.scan).not.toHaveBeenCalled();
  });

  it.each([[null], [['0']], [[0, []]], [['0', [1]]]])(
    'rejects malformed SCAN response %#',
    async (result) => {
      client.scan.mockResolvedValue(result);
      const capability = createRedisScanCapability({ getClient: () => client as any });

      const consume = async () => {
        for await (const _batch of capability.iterate({ prefix })) {
          // no-op
        }
      };
      await expect(consume()).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE' });
    }
  );

  it('rejects physical keys outside the FastGPT keyspace', async () => {
    client.scan.mockResolvedValue(['0', ['other:session:user:a']]);
    const capability = createRedisScanCapability({ getClient: () => client as any });

    const consume = async () => {
      for await (const _batch of capability.iterate({ prefix })) {
        // no-op
      }
    };
    await expect(consume()).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'scan.iterate'
    });
  });

  it('unlinks each scanned batch and returns the total deleted count', async () => {
    client.scan
      .mockResolvedValueOnce(['1', ['fastgpt:session:user:a']])
      .mockResolvedValueOnce(['0', ['fastgpt:session:user:b']]);
    client.unlink.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const capability = createRedisScanCapability({ getClient: () => client as any });

    await expect(capability.deleteByPrefix({ prefix })).resolves.toBe(2);
    expect(client.unlink.mock.calls).toEqual([
      ['fastgpt:session:user:a'],
      ['fastgpt:session:user:b']
    ]);
  });

  it('rejects malformed UNLINK counts', async () => {
    client.scan.mockResolvedValue(['0', ['fastgpt:session:user:a']]);
    client.unlink.mockResolvedValue(2);
    const capability = createRedisScanCapability({ getClient: () => client as any });

    await expect(capability.deleteByPrefix({ prefix })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
  });
});
