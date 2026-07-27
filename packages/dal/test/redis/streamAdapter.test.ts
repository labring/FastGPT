import { describe, expect, it, vi } from 'vitest';
import { asRedisLogicalKey, createRedisStoreAdapter } from '@fastgpt/dal/redis/adapter';

const key = asRedisLogicalKey('stream:resume:data:team:app:source:chat');
const physicalKey = 'fastgpt:stream:resume:data:team:app:source:chat';

describe('Redis Stream adapter operations', () => {
  it('uses explicit physical keys and parses XRANGE entries', async () => {
    const client = {
      call: vi.fn().mockResolvedValue([['1-0', ['raw', 'hello']]]),
      del: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
      set: vi.fn()
    } as any;
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });

    await expect(adapter.rangeStream({ key, start: '-', end: '+', count: 50 })).resolves.toEqual([
      { id: '1-0', fields: { raw: 'hello' } }
    ]);
    expect(client.call).toHaveBeenCalledWith('XRANGE', physicalKey, '-', '+', 'COUNT', 50);
  });

  it('does not retry XADD and validates its response', async () => {
    const client = {
      call: vi.fn().mockResolvedValue('2-0'),
      del: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
      set: vi.fn()
    } as any;
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });

    await expect(adapter.appendStreamEntry({ key, fields: { raw: 'hello' } })).resolves.toBe('2-0');
    expect(client.call).toHaveBeenCalledWith('XADD', physicalKey, '*', 'raw', 'hello');
  });

  it('releases a blocking connection exactly once', async () => {
    const blockingClient = {
      call: vi.fn().mockResolvedValue(null)
    };
    const releaseConnection = vi.fn().mockResolvedValue(undefined);
    const adapter = createRedisStoreAdapter({
      getCommandClient: () => ({}) as any,
      createBlockingConnection: () => blockingClient,
      releaseConnection
    });
    const reader = adapter.createBlockingStreamReader({ key, blockMs: 10 });

    await expect(reader.read('$')).resolves.toEqual([]);
    await reader.close();
    await reader.close();

    expect(blockingClient.call).toHaveBeenCalledWith(
      'XREAD',
      'BLOCK',
      10,
      'COUNT',
      1,
      'STREAMS',
      physicalKey,
      '$'
    );
    expect(releaseConnection).toHaveBeenCalledTimes(1);
    expect(releaseConnection).toHaveBeenCalledWith(blockingClient);
  });
});
