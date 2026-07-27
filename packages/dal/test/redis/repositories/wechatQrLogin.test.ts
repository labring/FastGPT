import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisStoreAdapter } from '@fastgpt/dal/redis/adapter';
import {
  WECHAT_QR_LOGIN_TTL_SECONDS,
  createWechatQrLoginRepository
} from '@fastgpt/dal/redis/repositories';

const key = {
  outLinkId: 'out-link-1',
  tmbId: 'tmb-1'
};
const logicalKey = 'cache:publish:wechat:qrcode:out-link-1:tmb-1';
const physicalKey = `fastgpt:${logicalKey}`;
const qrData = {
  qrcode: 'qr-id',
  qrcode_img_content: 'qr-content'
};

describe('createWechatQrLoginRepository', () => {
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
    redis.delete.mockResolvedValue(false);
  });

  it('preserves the physical key, JSON value and 480 second TTL', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue(JSON.stringify(qrData)),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1)
    };
    const adapter = createRedisStoreAdapter({ getCommandClient: () => commandClient as any });
    const repository = createWechatQrLoginRepository({ redis: adapter });

    await repository.set({ ...key, data: qrData });
    await expect(repository.get(key)).resolves.toEqual(qrData);
    await expect(repository.delete(key)).resolves.toBe(true);

    expect(WECHAT_QR_LOGIN_TTL_SECONDS).toBe(480);
    expect(commandClient.set).toHaveBeenCalledWith(
      physicalKey,
      JSON.stringify(qrData),
      'PX',
      480_000
    );
    expect(commandClient.get).toHaveBeenCalledWith(physicalKey);
    expect(commandClient.del).toHaveBeenCalledWith(physicalKey);
  });

  it('returns undefined only when Redis reports a missing key', async () => {
    const repository = createWechatQrLoginRepository({ redis: redis as any });

    await expect(repository.get(key)).resolves.toBeUndefined();
    expect(redis.get).toHaveBeenCalledWith(logicalKey);
  });

  it('decodes valid data and preserves additional upstream fields', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ ...qrData, upstream_trace_id: 'trace-1' }));
    const repository = createWechatQrLoginRepository({ redis: redis as any });

    await expect(repository.get(key)).resolves.toEqual({
      ...qrData,
      upstream_trace_id: 'trace-1'
    });
  });

  it('rejects invalid data before writing it to Redis', async () => {
    const repository = createWechatQrLoginRepository({ redis: redis as any });

    await expect(
      repository.set({
        ...key,
        data: { qrcode: '', qrcode_img_content: 'qr-content' }
      })
    ).rejects.toMatchObject({
      name: 'RedisInvalidArgumentError',
      code: 'REDIS_INVALID_ARGUMENT',
      operation: 'wechatQrLogin.set'
    });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON as an invalid Redis response', async () => {
    redis.get.mockResolvedValue('{not-json');
    const repository = createWechatQrLoginRepository({ redis: redis as any });

    await expect(repository.get(key)).rejects.toMatchObject({
      name: 'RedisInvalidResponseError',
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'wechatQrLogin.get'
    });
  });

  it('rejects JSON with missing QR fields as an invalid Redis response', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ qrcode: 'qr-id' }));
    const repository = createWechatQrLoginRepository({ redis: redis as any });

    await expect(repository.get(key)).rejects.toMatchObject({
      name: 'RedisInvalidResponseError',
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'wechatQrLogin.get'
    });
  });

  it.each([
    ['read', () => createWechatQrLoginRepository({ redis: redis as any }).get(key)],
    [
      'write',
      () => createWechatQrLoginRepository({ redis: redis as any }).set({ ...key, data: qrData })
    ],
    ['delete', () => createWechatQrLoginRepository({ redis: redis as any }).delete(key)]
  ])('propagates Redis %s errors', async (operation, action) => {
    const error = new Error(`${operation} failed`);
    redis.get.mockRejectedValue(error);
    redis.set.mockRejectedValue(error);
    redis.delete.mockRejectedValue(error);

    await expect(action()).rejects.toBe(error);
  });
});
