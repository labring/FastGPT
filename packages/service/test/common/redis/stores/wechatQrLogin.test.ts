import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisCapabilities } from '@fastgpt/service/common/redis/capability';
import type {
  RedisInvalidArgumentError,
  RedisInvalidResponseError
} from '@fastgpt/service/common/redis/runtime/errors';
import {
  WECHAT_QR_LOGIN_TTL_SECONDS,
  createWechatQrLoginStore
} from '@fastgpt/service/common/redis/stores';

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

describe('createWechatQrLoginStore', () => {
  const stringStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stringStore.get.mockResolvedValue(null);
    stringStore.set.mockResolvedValue(undefined);
    stringStore.delete.mockResolvedValue(false);
  });

  it('preserves the physical key, JSON value and 480 second TTL', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue(JSON.stringify(qrData)),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1)
    };
    const capabilities = createRedisCapabilities({
      getCommandClient: () => commandClient as any,
      createBlockingClient: vi.fn() as any
    });
    const store = createWechatQrLoginStore({ stringStore: capabilities.string });

    await store.set({ ...key, data: qrData });
    await expect(store.get(key)).resolves.toEqual(qrData);
    await expect(store.delete(key)).resolves.toBe(true);

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
    const store = createWechatQrLoginStore({ stringStore: stringStore as any });

    await expect(store.get(key)).resolves.toBeUndefined();
    expect(stringStore.get).toHaveBeenCalledWith(logicalKey);
  });

  it('decodes valid data and preserves additional upstream fields', async () => {
    stringStore.get.mockResolvedValue(JSON.stringify({ ...qrData, upstream_trace_id: 'trace-1' }));
    const store = createWechatQrLoginStore({ stringStore: stringStore as any });

    await expect(store.get(key)).resolves.toEqual({
      ...qrData,
      upstream_trace_id: 'trace-1'
    });
  });

  it('rejects invalid data before writing it to Redis', async () => {
    const store = createWechatQrLoginStore({ stringStore: stringStore as any });

    await expect(
      store.set({
        ...key,
        data: { qrcode: '', qrcode_img_content: 'qr-content' }
      })
    ).rejects.toMatchObject<Partial<RedisInvalidArgumentError>>({
      name: 'RedisInvalidArgumentError',
      code: 'REDIS_INVALID_ARGUMENT',
      operation: 'wechatQrLogin.set'
    });
    expect(stringStore.set).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON as an invalid Redis response', async () => {
    stringStore.get.mockResolvedValue('{not-json');
    const store = createWechatQrLoginStore({ stringStore: stringStore as any });

    await expect(store.get(key)).rejects.toMatchObject<Partial<RedisInvalidResponseError>>({
      name: 'RedisInvalidResponseError',
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'wechatQrLogin.get'
    });
  });

  it('rejects JSON with missing QR fields as an invalid Redis response', async () => {
    stringStore.get.mockResolvedValue(JSON.stringify({ qrcode: 'qr-id' }));
    const store = createWechatQrLoginStore({ stringStore: stringStore as any });

    await expect(store.get(key)).rejects.toMatchObject<Partial<RedisInvalidResponseError>>({
      name: 'RedisInvalidResponseError',
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'wechatQrLogin.get'
    });
  });

  it.each([
    ['read', () => createWechatQrLoginStore({ stringStore: stringStore as any }).get(key)],
    [
      'write',
      () =>
        createWechatQrLoginStore({ stringStore: stringStore as any }).set({ ...key, data: qrData })
    ],
    ['delete', () => createWechatQrLoginStore({ stringStore: stringStore as any }).delete(key)]
  ])('propagates Redis %s errors', async (operation, action) => {
    const error = new Error(`${operation} failed`);
    stringStore.get.mockRejectedValue(error);
    stringStore.set.mockRejectedValue(error);
    stringStore.delete.mockRejectedValue(error);

    await expect(action()).rejects.toBe(error);
  });
});
