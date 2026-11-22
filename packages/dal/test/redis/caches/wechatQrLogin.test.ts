import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { WECHAT_QR_LOGIN_TTL_SECONDS, WechatQrLoginCache } from '@fastgpt/dal/redis/caches';

const key = {
  outLinkId: 'out-link-1',
  tmbId: 'tmb-1',
  attemptId: 'attempt-1'
};
const logicalKey = 'cache:publish:wechat:qrcode:out-link-1:tmb-1:attempt-1';
const physicalKey = `fastgpt:${logicalKey}`;
const qrData = {
  qrcode: 'qr-id'
};

describe('WechatQrLoginCache', () => {
  const redis = {
    get: vi.fn(),
    set: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
  });

  it('isolates the physical key by attempt and keeps the JSON value and 480 second TTL', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue(JSON.stringify(qrData)),
      set: vi.fn().mockResolvedValue('OK')
    };
    const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new WechatQrLoginCache({ redis: adapter });

    await cache.set({ ...key, data: qrData });
    await expect(cache.get(key)).resolves.toEqual(qrData);

    expect(WECHAT_QR_LOGIN_TTL_SECONDS).toBe(480);
    expect(commandClient.set).toHaveBeenCalledWith(
      physicalKey,
      JSON.stringify(qrData),
      'PX',
      480_000
    );
    expect(commandClient.get).toHaveBeenCalledWith(physicalKey);
    await cache.get({ ...key, attemptId: 'attempt-2' });
    expect(commandClient.get).toHaveBeenLastCalledWith(
      'fastgpt:cache:publish:wechat:qrcode:out-link-1:tmb-1:attempt-2'
    );
  });

  it('returns undefined only when Redis reports a missing key', async () => {
    const cache = new WechatQrLoginCache({ redis: redis as any });

    await expect(cache.get(key)).resolves.toBeUndefined();
    expect(redis.get).toHaveBeenCalledWith(logicalKey);
  });

  it('reads the QR identifier from a cache entry containing legacy QR image data', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ ...qrData, qrcode_img_content: 'qr-content' }));
    const cache = new WechatQrLoginCache({ redis: redis as any });

    await expect(cache.get(key)).resolves.toEqual(qrData);
  });

  it('rejects invalid data before writing it to Redis', async () => {
    const cache = new WechatQrLoginCache({ redis: redis as any });

    await expect(
      cache.set({
        ...key,
        data: { qrcode: '' }
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
    const cache = new WechatQrLoginCache({ redis: redis as any });

    await expect(cache.get(key)).rejects.toMatchObject({
      name: 'RedisInvalidResponseError',
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'wechatQrLogin.get'
    });
  });

  it('rejects JSON with a missing QR identifier as an invalid Redis response', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ qrcode_img_content: 'qr-content' }));
    const cache = new WechatQrLoginCache({ redis: redis as any });

    await expect(cache.get(key)).rejects.toMatchObject({
      name: 'RedisInvalidResponseError',
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'wechatQrLogin.get'
    });
  });

  it.each([
    ['read', () => new WechatQrLoginCache({ redis: redis as any }).get(key)],
    ['write', () => new WechatQrLoginCache({ redis: redis as any }).set({ ...key, data: qrData })]
  ])('propagates Redis %s errors', async (operation, action) => {
    const error = new Error(`${operation} failed`);
    redis.get.mockRejectedValue(error);
    redis.set.mockRejectedValue(error);

    await expect(action()).rejects.toBe(error);
  });
});
