import { z } from 'zod';
import { asRedisLogicalKey, redisRepositoryAdapter, type RedisStoreAdapter } from '../adapter';
import { RedisInvalidArgumentError, RedisInvalidResponseError } from '../runtime/errors';

export const WECHAT_QR_LOGIN_TTL_SECONDS = 8 * 60;

const WechatQrLoginDataSchema = z.looseObject({
  qrcode: z.string().min(1),
  qrcode_img_content: z.string().min(1)
});

export type WechatQrLoginData = z.infer<typeof WechatQrLoginDataSchema>;

export type WechatQrLoginRepositoryDependencies = {
  redis?: Pick<RedisStoreAdapter, 'delete' | 'get' | 'set'>;
};

type WechatQrLoginKey = {
  outLinkId: string;
  tmbId: string;
};

/**
 * 创建微信二维码登录 Repository。
 *
 * Repository 保持历史物理 key、JSON value 和 480 秒 TTL。Redis miss 返回 undefined；
 * Redis 操作错误和损坏的缓存数据均 fail-closed，由应用边界处理。
 */
export const createWechatQrLoginRepository = ({
  redis = redisRepositoryAdapter
}: WechatQrLoginRepositoryDependencies = {}) => {
  const getKey = ({ outLinkId, tmbId }: WechatQrLoginKey) =>
    asRedisLogicalKey(`cache:publish:wechat:qrcode:${outLinkId}:${tmbId}`);

  return {
    /** 校验并保存 iLink 二维码响应；上游响应不合法时不会写入损坏缓存。 */
    set: async ({
      outLinkId,
      tmbId,
      data
    }: WechatQrLoginKey & {
      data: WechatQrLoginData;
    }) => {
      const parsed = WechatQrLoginDataSchema.safeParse(data);
      if (!parsed.success) {
        throw new RedisInvalidArgumentError({
          operation: 'wechatQrLogin.set',
          message: 'Wechat QR login data is invalid'
        });
      }

      await redis.set({
        key: getKey({ outLinkId, tmbId }),
        value: JSON.stringify(parsed.data),
        ttlMs: WECHAT_QR_LOGIN_TTL_SECONDS * 1000
      });
    },
    /** 读取并校验缓存；只有 Redis 中不存在该 key 时才返回 undefined。 */
    get: async ({ outLinkId, tmbId }: WechatQrLoginKey) => {
      const raw = await redis.get(getKey({ outLinkId, tmbId }));
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
    },
    /** 删除已确认的二维码状态；删除失败继续向上抛出，保持 fail-closed 语义。 */
    delete: ({ outLinkId, tmbId }: WechatQrLoginKey) => redis.delete(getKey({ outLinkId, tmbId }))
  };
};

export type WechatQrLoginRepository = ReturnType<typeof createWechatQrLoginRepository>;

export const wechatQrLoginRepository = createWechatQrLoginRepository();
