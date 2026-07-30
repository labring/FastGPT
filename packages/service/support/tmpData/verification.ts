import { MongoTmpData } from './schema';
import type { ClientSession } from '../../common/mongo';

export type Scene =
  | 'login'
  | 'register'
  | 'forgetPassword'
  | 'changePassword'
  | 'unsubscribe'
  | 'bindNotification';

export type Type = 'password' | 'code' | 'captcha' | 'wechat' | 'oauth';

export type VerificationConsumeMatch = Record<string, unknown>;

/** 构造身份验证材料在 tmp_datas 中使用的稳定 ID。 */
export const getDataId = (scene: Scene, type: Type, key: string) =>
  `verification:v1:${scene}:${type}:${key}`;

/** 身份验证材料的临时存取包装，不包含具体业务场景的接入逻辑。 */
export const verification = {
  /** 覆盖同一场景、类型和 key 的材料，并刷新过期时间。 */
  upsert: <T>(
    scene: Scene,
    type: Type,
    key: string,
    data: T,
    expiredAt: Date,
    session?: ClientSession
  ) => {
    const dataId = getDataId(scene, type, key);

    return MongoTmpData.updateOne(
      { dataId },
      {
        dataId,
        data,
        expireAt: expiredAt
      },
      { upsert: true, ...(session ? { session } : {}) }
    );
  },

  /** 只删除仍匹配当前材料内容的记录，避免清理并发请求新写入的验证码。 */
  deleteIfMatch: async (
    scene: Scene,
    type: Type,
    key: string,
    match: VerificationConsumeMatch = {},
    session?: ClientSession
  ) => {
    const dataMatch = Object.fromEntries(
      Object.entries(match).map(([field, value]) => [`data.${field}`, value])
    );

    return MongoTmpData.deleteOne(
      {
        dataId: getDataId(scene, type, key),
        ...dataMatch
      },
      { ...(session ? { session } : {}) }
    );
  },

  /** 原子消费仍在有效期内的材料，并返回材料内容。 */
  consume: async <T>(
    scene: Scene,
    type: Type,
    key: string,
    match: VerificationConsumeMatch = {}
  ): Promise<T | null> => {
    const dataMatch = Object.fromEntries(
      Object.entries(match).map(([field, value]) => [`data.${field}`, value])
    );
    const result = await MongoTmpData.findOneAndDelete({
      dataId: getDataId(scene, type, key),
      expireAt: { $gt: new Date() },
      ...dataMatch
    }).lean();

    return result ? (result.data as T) : null;
  },

  /** 读取有效的微信材料；仅在已有 openId 时原子消费，未扫码时保留材料。 */
  getAndDelete: async <T extends { openId?: string }>(
    scene: Scene,
    type: Type,
    key: string
  ): Promise<T | null | undefined> => {
    const result = await MongoTmpData.findOne({
      dataId: getDataId(scene, type, key),
      expireAt: { $gt: new Date() }
    }).lean();

    if (!result) {
      return null;
    }

    if (!(result.data as T | null)?.openId) {
      return;
    }

    return (
      (await verification.consume<T>(scene, type, key, {
        openId: { $exists: true }
      })) ?? undefined
    );
  }
};
