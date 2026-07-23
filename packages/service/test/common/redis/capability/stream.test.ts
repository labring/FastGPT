import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisStreamCapability } from '@fastgpt/service/common/redis/capability/stream';
import { asRedisLogicalKey } from '@fastgpt/service/common/redis/runtime/keyspace';

const createClient = () => ({
  pexpire: vi.fn(),
  xadd: vi.fn(),
  xrange: vi.fn(),
  xtrim: vi.fn()
});

const createBlockingResource = () => ({
  client: { xread: vi.fn() },
  release: vi.fn(async () => undefined)
});

describe('createRedisStreamCapability', () => {
  const key = asRedisLogicalKey('stream:test');
  let client: ReturnType<typeof createClient>;
  let blocking: ReturnType<typeof createBlockingResource>;
  let createBlockingClient: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = createClient();
    blocking = createBlockingResource();
    createBlockingClient = vi.fn(() => blocking);
  });

  it('appends flattened fields and returns the stream id', async () => {
    client.xadd.mockResolvedValue('1-0');
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(
      capability.append({ key, fields: { event: 'message', data: 'hello' } })
    ).resolves.toBe('1-0');
    expect(client.xadd).toHaveBeenCalledWith(
      'fastgpt:stream:test',
      '*',
      'event',
      'message',
      'data',
      'hello'
    );
  });

  it.each([
    [null as any, 'fields must be a record'],
    [[] as any, 'fields must be a record'],
    [{}, 'fields must contain between 1 and 128 entries'],
    [{ '': 'value' }, 'stream field must be a non-empty string'],
    [{ field: 1 as any }, 'stream field values must be strings']
  ])('rejects invalid stream fields %#', (fields, message) => {
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    expect(() => capability.append({ key, fields })).toThrow(message);
  });

  it('rejects oversized stream field collections', () => {
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });
    const fields = Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [`field-${index}`, 'value'])
    );

    expect(() => capability.append({ key, fields })).toThrow(
      'fields must contain between 1 and 128 entries'
    );
  });

  it.each([null, ''])('rejects invalid XADD response %#', async (result) => {
    client.xadd.mockResolvedValue(result);
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.append({ key, fields: { data: 'value' } })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
  });

  it('reads and parses a bounded stream range', async () => {
    client.xrange.mockResolvedValue([
      ['1-0', ['event', 'message', 'data', 'hello']],
      ['2-0', []]
    ]);
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.readRange({ key })).resolves.toEqual([
      { id: '1-0', fields: { event: 'message', data: 'hello' } },
      { id: '2-0', fields: {} }
    ]);
    expect(client.xrange).toHaveBeenCalledWith('fastgpt:stream:test', '-', '+', 'COUNT', 100);
  });

  it.each([
    [{ key, start: '' }, 'start'],
    [{ key, end: '' }, 'end'],
    [{ key, count: 0 }, 'count'],
    [{ key, count: 1_001 }, 'count']
  ])('rejects invalid range input %#', (input, message) => {
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    expect(() => capability.readRange(input)).toThrow(message);
  });

  it.each([null, [['1-0']], [[1, []]], [['1-0', ['field']]], [['1-0', ['field', 1]]]])(
    'rejects malformed range response %#',
    async (result) => {
      client.xrange.mockResolvedValue(result);
      const capability = createRedisStreamCapability({
        getClient: () => client as any,
        createBlockingClient
      });

      await expect(capability.readRange({ key })).rejects.toMatchObject({
        code: 'REDIS_INVALID_RESPONSE'
      });
    }
  );

  it('returns an empty blocking read on Redis timeout and always releases the client', async () => {
    blocking.client.xread.mockResolvedValue(null);
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.readBlocking({ key, afterId: '$', blockMs: 100 })).resolves.toEqual([]);
    expect(blocking.client.xread).toHaveBeenCalledWith(
      'COUNT',
      1,
      'BLOCK',
      100,
      'STREAMS',
      'fastgpt:stream:test',
      '$'
    );
    expect(blocking.release).toHaveBeenCalledTimes(1);
  });

  it('parses blocking entries and releases after success', async () => {
    blocking.client.xread.mockResolvedValue([
      ['fastgpt:stream:test', [['1-0', ['data', 'hello']]]]
    ]);
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(
      capability.readBlocking({ key, afterId: '0-0', blockMs: 100, count: 2 })
    ).resolves.toEqual([{ id: '1-0', fields: { data: 'hello' } }]);
    expect(blocking.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ key, afterId: '', blockMs: 1 }, 'afterId'],
    [{ key, afterId: '$', blockMs: 0 }, 'blockMs'],
    [{ key, afterId: '$', blockMs: 60_001 }, 'blockMs'],
    [{ key, afterId: '$', blockMs: 1, count: 0 }, 'count']
  ])('rejects blocking input before creating a client %#', async (input, message) => {
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.readBlocking(input)).rejects.toThrow(message);
    expect(createBlockingClient).not.toHaveBeenCalled();
  });

  it.each([
    { result: [] },
    { result: [[1, []]] },
    { result: [['fastgpt:stream:other', []]] },
    { result: [['fastgpt:stream:test']] },
    { result: [['fastgpt:stream:test', 'invalid']] }
  ])('rejects malformed XREAD envelope %# and releases the client', async ({ result }) => {
    blocking.client.xread.mockResolvedValue(result);
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.readBlocking({ key, afterId: '$', blockMs: 1 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
    expect(blocking.release).toHaveBeenCalledTimes(1);
  });

  it('releases the blocking client after command failure', async () => {
    blocking.client.xread.mockRejectedValue(new Error('WRONGTYPE'));
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.readBlocking({ key, afterId: '$', blockMs: 1 })).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
      role: 'blocking'
    });
    expect(blocking.release).toHaveBeenCalledTimes(1);
  });

  it('wraps blocking client acquisition failures', async () => {
    const cause = new Error('Redis runtime is closed');
    createBlockingClient.mockImplementation(() => {
      throw cause;
    });
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.readBlocking({ key, afterId: '$', blockMs: 1 })).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
      role: 'blocking',
      outcome: 'failed',
      cause
    });
    expect(blocking.release).not.toHaveBeenCalled();
  });

  it('trims approximately and expires streams', async () => {
    client.xtrim.mockResolvedValue(3);
    client.pexpire.mockResolvedValue(1);
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.trim({ key, maxLength: 100 })).resolves.toBe(3);
    await expect(capability.expire({ key, ttlMs: 500 })).resolves.toBe(true);
    expect(client.xtrim).toHaveBeenCalledWith('fastgpt:stream:test', 'MAXLEN', '~', 100);
    expect(client.pexpire).toHaveBeenCalledWith('fastgpt:stream:test', 500);
  });

  it.each([
    [
      'trim',
      () =>
        createRedisStreamCapability({ getClient: () => client as any, createBlockingClient }).trim({
          key,
          maxLength: 0
        })
    ],
    [
      'expire',
      () =>
        createRedisStreamCapability({
          getClient: () => client as any,
          createBlockingClient
        }).expire({ key, ttlMs: 0 })
    ]
  ])('rejects invalid %s input', (_name, execute) => {
    expect(execute).toThrow('must be a positive safe integer');
  });

  it('rejects malformed trim and expire responses', async () => {
    client.xtrim.mockResolvedValue(-1);
    client.pexpire.mockResolvedValue(2);
    const capability = createRedisStreamCapability({
      getClient: () => client as any,
      createBlockingClient
    });

    await expect(capability.trim({ key, maxLength: 1 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
    await expect(capability.expire({ key, ttlMs: 1 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE'
    });
  });
});
