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

  it.each([null, [['1-0']], [['1-0', ['raw', 'value'], 'extra']]])(
    'rejects malformed Stream entries %#',
    async (response) => {
      const client = {
        call: vi.fn().mockResolvedValue(response),
        del: vi.fn(),
        expire: vi.fn(),
        get: vi.fn(),
        set: vi.fn()
      } as any;
      const adapter = createRedisStoreAdapter({ getCommandClient: () => client });

      await expect(
        adapter.rangeStream({ key, start: '-', end: '+', count: 10 })
      ).rejects.toMatchObject({
        code: 'REDIS_INVALID_RESPONSE',
        operation: 'stream.range'
      });
    }
  );

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

  it.each([null, ''])('rejects malformed XADD responses %#', async (response) => {
    const client = {
      call: vi.fn().mockResolvedValue(response),
      del: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
      set: vi.fn()
    } as any;
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });

    await expect(
      adapter.appendStreamEntry({ key, fields: { raw: 'hello' } })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'stream.append'
    });
    expect(client.call).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{}, 'stream fields must contain at least one string value'],
    [{ raw: 1 }, 'stream fields must contain at least one string value']
  ])('rejects invalid XADD fields %#', (fields, message) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => ({}) as any });

    expect(() => adapter.appendStreamEntry({ key, fields: fields as any })).toThrow(message);
  });

  it('rejects a non-string XADD value before opening a connection', () => {
    const getCommandClient = vi.fn(() => ({}) as any);
    const adapter = createRedisStoreAdapter({ getCommandClient });

    expect(() => adapter.appendStreamEntry({ key, fields: { raw: 1 as any } })).toThrow(
      'stream fields must contain at least one string value'
    );
    expect(getCommandClient).not.toHaveBeenCalled();
  });

  it('does not retry a result-unknown XADD failure', async () => {
    const client = {
      call: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
      del: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
      set: vi.fn()
    } as any;
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });

    await expect(
      adapter.appendStreamEntry({ key, fields: { raw: 'hello' } })
    ).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
      operation: 'stream.append',
      outcome: 'unknown'
    });
    expect(client.call).toHaveBeenCalledTimes(1);
  });

  it('refreshes Stream TTL and validates EXPIRE responses', async () => {
    const client = {
      call: vi.fn(),
      del: vi.fn(),
      expire: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      get: vi.fn(),
      set: vi.fn()
    } as any;
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });

    await expect(adapter.expireStream({ key, ttlSeconds: 30 })).resolves.toBeUndefined();
    await expect(adapter.expireStream({ key, ttlSeconds: 30 })).resolves.toBeUndefined();
    expect(client.expire).toHaveBeenNthCalledWith(1, physicalKey, 30);
    expect(client.expire).toHaveBeenNthCalledWith(2, physicalKey, 30);
  });

  it('rejects an unsupported EXPIRE response', async () => {
    const client = {
      call: vi.fn(),
      del: vi.fn(),
      expire: vi.fn().mockResolvedValue(2),
      get: vi.fn(),
      set: vi.fn()
    } as any;
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });

    await expect(adapter.expireStream({ key, ttlSeconds: 30 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'stream.expire'
    });
  });

  it.each([0, 1.5, '30'])('rejects invalid Stream TTL %s', (ttlSeconds) => {
    const client = { expire: vi.fn() };
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.expireStream({ key, ttlSeconds: ttlSeconds as any })).toThrow(
      'ttlSeconds must be a positive safe integer'
    );
    expect(client.expire).not.toHaveBeenCalled();
  });

  it('rejects malformed XRANGE entries and invalid range arguments', async () => {
    const client = {
      call: vi.fn().mockResolvedValue([['1-0', ['raw']]]),
      del: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
      set: vi.fn()
    } as any;
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });

    await expect(
      adapter.rangeStream({ key, start: '-', end: '+', count: 10 })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'stream.range'
    });
    expect(() => adapter.rangeStream({ key, start: 1 as any, end: '+', count: 10 })).toThrow(
      'stream range bounds must be strings'
    );
    expect(() => adapter.rangeStream({ key, start: '-', end: '+', count: 0 })).toThrow(
      'count must be a positive safe integer'
    );
  });

  it.each([
    [],
    [['other:key', []]],
    [['fastgpt:stream:resume:data:team:app:source:chat', [['1-0', ['raw']]]]]
  ] as unknown[])('rejects malformed XREAD responses %#', async (response: unknown) => {
    const blockingClient = {
      call: vi.fn().mockResolvedValue(response)
    };
    const releaseConnection = vi.fn().mockResolvedValue(undefined);
    const adapter = createRedisStoreAdapter({
      getCommandClient: () => ({}) as any,
      createBlockingConnection: () => blockingClient,
      releaseConnection
    });
    const reader = adapter.createBlockingStreamReader({ key, blockMs: 10 });

    await expect(reader.read('$')).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'stream.read'
    });
    await reader.close();
  });

  it('rejects an XREAD response for a different physical stream key', async () => {
    const blockingClient = {
      call: vi.fn().mockResolvedValue([['other:stream', []]])
    };
    const releaseConnection = vi.fn().mockResolvedValue(undefined);
    const adapter = createRedisStoreAdapter({
      getCommandClient: () => ({}) as any,
      createBlockingConnection: () => blockingClient,
      releaseConnection
    });
    const reader = adapter.createBlockingStreamReader({ key, blockMs: 10 });

    await expect(reader.read('$')).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'stream.read'
    });
    await reader.close();
  });

  it('parses a valid blocking XREAD response into typed stream entries', async () => {
    const blockingClient = {
      call: vi.fn().mockResolvedValue([[physicalKey, [['2-0', ['raw', 'hello', 'kind', 'delta']]]]])
    };
    const releaseConnection = vi.fn().mockResolvedValue(undefined);
    const adapter = createRedisStoreAdapter({
      getCommandClient: () => ({}) as any,
      createBlockingConnection: () => blockingClient,
      releaseConnection
    });
    const reader = adapter.createBlockingStreamReader({ key, blockMs: 10, count: 2 });

    await expect(reader.read('1-0')).resolves.toEqual([
      { id: '2-0', fields: { raw: 'hello', kind: 'delta' } }
    ]);
    expect(blockingClient.call).toHaveBeenCalledWith(
      'XREAD',
      'BLOCK',
      10,
      'COUNT',
      2,
      'STREAMS',
      physicalKey,
      '1-0'
    );
    await reader.close();
    expect(releaseConnection).toHaveBeenCalledWith(blockingClient);
  });

  it('validates reader arguments and keeps a failed close promise idempotent', async () => {
    const blockingClient = { call: vi.fn() };
    const releaseConnection = vi.fn().mockRejectedValue(new Error('release failed'));
    const adapter = createRedisStoreAdapter({
      getCommandClient: () => ({}) as any,
      createBlockingConnection: () => blockingClient,
      releaseConnection
    });

    expect(() => adapter.createBlockingStreamReader({ key, blockMs: 0 })).toThrow(
      'blockMs must be a positive safe integer'
    );
    const reader = adapter.createBlockingStreamReader({ key, blockMs: 10, count: 2 });
    expect(() => reader.read('')).toThrow('stream cursor must be a non-empty string');
    await expect(reader.close()).rejects.toThrow('release failed');
    await expect(reader.close()).rejects.toThrow('release failed');
    expect(releaseConnection).toHaveBeenCalledTimes(1);
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
