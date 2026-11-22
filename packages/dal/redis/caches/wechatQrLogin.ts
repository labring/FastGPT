import { z } from 'zod';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from '../runtime/errors';

export const WECHAT_QR_LOGIN_TTL_SECONDS = 8 * 60;

const WechatQrLoginDataSchema = z.looseObject({
  qrcode: z.string().min(1),
  qrcode_img_content: z.string().min(1)
});

export type WechatQrLoginData = z.infer<typeof WechatQrLoginDataSchema>;

export type WechatQrLoginCacheOptions = {
  redis?: RedisCacheAdapter;
};

type WechatQrLoginKey = {
  outLinkId: string;
  tmbId: string;
  attemptId: string;
};

/**
 * 微信二维码登录 Cache。
 *
 * Cache 按扫码会话隔离，JSON value 保留 480 秒。Redis miss 返回 undefined；
 * Redis 操作错误和损坏的缓存数据均 fail-closed，由应用边界处理。
 */
export class WechatQrLoginCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: WechatQrLoginCacheOptions = {}) {
    this.redis = redis;
  }

  private getKey = ({ outLinkId, tmbId, attemptId }: WechatQrLoginKey) =>
    asRedisLogicalKey(`cache:publish:wechat:qrcode:${outLinkId}:${tmbId}:${attemptId}`);

  /** 校验并保存 iLink 二维码响应；上游响应不合法时不会写入损坏缓存。 */
  async set({
    outLinkId,
    tmbId,
    attemptId,
    data
  }: WechatQrLoginKey & {
    data: WechatQrLoginData;
  }) {
    const parsed = WechatQrLoginDataSchema.safeParse(data);
    if (!parsed.success) {
      throw new RedisInvalidArgumentError({
        operation: 'wechatQrLogin.set',
        message: 'Wechat QR login data is invalid'
      });
    }

    await this.redis.set({
      key: this.getKey({ outLinkId, tmbId, attemptId }),
      value: JSON.stringify(parsed.data),
      ttlMs: WECHAT_QR_LOGIN_TTL_SECONDS * 1000
    });
  }

  /** 读取并校验缓存；只有 Redis 中不存在该 key 时才返回 undefined。 */
  async get(key: WechatQrLoginKey) {
    const raw = await this.redis.get(this.getKey(key));
    if (raw === null) return undefined;

    const data = (() => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new RedisInvalidResponseError({
          operation: 'wechatQrLogin.get',
          message: 'Wechat QR login cache contains invalid JSON'
        });
      }
    })();
    const parsed = WechatQrLoginDataSchema.safeParse(data);
    if (!parsed.success) {
      throw new RedisInvalidResponseError({
        operation: 'wechatQrLogin.get',
        message: 'Wechat QR login cache contains invalid data'
      });
    }

    return parsed.data;
  }
}

export const wechatQrLoginCache = new WechatQrLoginCache();
