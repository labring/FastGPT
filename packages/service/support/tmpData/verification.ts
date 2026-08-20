import { MongoTmpData } from './schema';
import type { ClientSession } from '../../common/mongo';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import {
  VerificationTtlSeconds,
  type AccountVerificationPurpose,
  type VerificationMaterial,
  type VerificationMaterialMatch,
  type VerificationScene,
  type VerificationType,
  type VerificationTtlPreset
} from '@fastgpt/global/support/user/account/verification/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { transactionRunner, tmpDataRepository } from '../../common/dal';
import type { TransactionContext } from '../../common/dal';

export type Scene = AccountVerificationPurpose;
export type Type = VerificationType;
export type VerificationConsumeMatch<T extends Type = Type> = VerificationMaterialMatch<T>;

type VerificationDataIdParamsByType<T extends Type> = {
  scene: VerificationScene<T>;
  type: T;
  key: string;
};

export type VerificationDataIdParams = {
  [T in Type]: VerificationDataIdParamsByType<T>;
}[Type];

type VerificationGetParams<T extends Type> = VerificationDataIdParamsByType<T> & {
  match?: VerificationConsumeMatch<T>;
  session?: ClientSession;
};

type VerificationUpsertParams<T extends Type> = VerificationDataIdParamsByType<T> & {
  data: VerificationMaterial<T>;
  ttlPreset: VerificationTtlPreset;
  session?: ClientSession;
};

type VerificationCreateParams<T extends Type> = VerificationUpsertParams<T>;

type VerificationUpdateParams<T extends Type> = VerificationUpsertParams<T>;

type VerificationDeleteParams<T extends Type> = VerificationDataIdParamsByType<T> & {
  match?: VerificationConsumeMatch<T>;
  session?: ClientSession;
};

export type VerificationConsumeParams<T extends Type> = {
  scene: VerificationScene<T>;
  type: T;
  key: string;
  match?: VerificationConsumeMatch<T>;
};

export type VerificationConsumeContext<T extends Type> = {
  material: VerificationMaterial<T>;
  session: ClientSession;
};

export type VerificationConsumeDalContext<T extends Type> = {
  material: VerificationMaterial<T>;
  dalContext: TransactionContext;
};

export class VerificationMaterialError extends Error {
  constructor() {
    super('Verification material is invalid or already consumed');
    this.name = 'VerificationMaterialError';
  }
}

/** 构造身份验证材料在 tmp_datas 中使用的稳定 ID，并绑定合法场景和材料类型。 */
export const getDataId = <T extends Type>({
  scene,
  type,
  key
}: VerificationDataIdParamsByType<T>) => `verification:v1:${scene}:${type}:${key}`;

/** 为账号下的单个验证码生成稳定且不暴露验证码明文的材料 key。 */
export const getCodeVerificationKey = ({ account, code }: { account: string; code: string }) =>
  `${account}:${hashStr(code.toLowerCase())}`;

/** 将材料字段转换为 Mongo 查询字段，字段名受具体材料类型约束。 */
const getDataMatch = (match: VerificationConsumeMatch) =>
  Object.fromEntries(Object.entries(match).map(([field, value]) => [`data.${field}`, value]));

const getActiveFilter = <T extends Type>(params: VerificationConsumeParams<T>) => ({
  dataId: getDataId(params),
  expireAt: { $gt: new Date() },
  ...getDataMatch(params.match ?? {})
});

const findActiveRecord = async <T extends Type>(
  params: VerificationConsumeParams<T>,
  session?: ClientSession
) => {
  const query = MongoTmpData.findOne(getActiveFilter(params));
  if (session) query.session(session);
  return query.lean();
};

/** 根据统一 TTL 档位计算材料过期时间，避免业务层自行构造 Date。 */
const getExpireAt = (ttlPreset: VerificationTtlPreset) =>
  new Date(Date.now() + VerificationTtlSeconds[ttlPreset] * 1000);

const isMongoDuplicateKeyError = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 11000;

/**
 * 身份验证材料的临时存取包装。
 *
 * 每个方法通过同一个类型参数关联 scene、type 和 data/match，调用方不再能
 * 通过无关的泛型把验证码材料当成其它材料读取，也不能拼写不存在的字段。
 */
export const verification = {
  /**
   * 仅在同 ID 不存在有效材料时创建，用于允许同账号的不同验证码并存。
   * 过期记录可能尚未被 TTL 索引清理，因此创建前会精确删除同 ID 的过期记录。
   */
  createIfInactive: async <T extends Type>(params: VerificationCreateParams<T>) => {
    const dataId = getDataId(params);
    if (params.session) {
      const sessionOptions = { session: params.session };

      await MongoTmpData.deleteOne({ dataId, expireAt: { $lte: new Date() } }, sessionOptions);

      try {
        await MongoTmpData.create(
          [{ dataId, data: params.data, expireAt: getExpireAt(params.ttlPreset) }],
          sessionOptions
        );
        return true;
      } catch (error) {
        if (isMongoDuplicateKeyError(error)) return false;
        throw error;
      }
    }

    return tmpDataRepository.createIfInactive({
      dataId,
      data: params.data,
      expireAt: getExpireAt(params.ttlPreset)
    });
  },

  /** 覆盖同一场景、类型和 key 的材料，并刷新过期时间。 */
  upsert: async <T extends Type>(params: VerificationUpsertParams<T>) => {
    const dataId = getDataId(params);
    if (!params.session) {
      return tmpDataRepository.upsert({
        dataId,
        data: params.data,
        expireAt: getExpireAt(params.ttlPreset)
      });
    }

    return MongoTmpData.updateOne(
      { dataId },
      {
        dataId,
        data: params.data,
        expireAt: getExpireAt(params.ttlPreset)
      },
      { upsert: true, ...(params.session ? { session: params.session } : {}) }
    );
  },

  /** 只更新仍在有效期内的已有材料，避免回调重新创建或刷新过期材料。 */
  updateIfActive: async <T extends Type>(params: VerificationUpdateParams<T>) => {
    if (!params.session) {
      return tmpDataRepository.updateIfActive({
        dataId: getDataId(params),
        data: params.data,
        expireAt: getExpireAt(params.ttlPreset)
      });
    }

    return MongoTmpData.updateOne(
      {
        dataId: getDataId(params),
        expireAt: { $gt: new Date() }
      },
      {
        $set: {
          data: params.data,
          expireAt: getExpireAt(params.ttlPreset)
        }
      },
      { ...(params.session ? { session: params.session } : {}) }
    );
  },

  /** 只删除仍有效且匹配当前材料内容的记录，避免清理并发请求新写入的验证码。 */
  deleteIfMatch: async <T extends Type>(params: VerificationDeleteParams<T>) => {
    const { session, ...filterParams } = params;
    if (!session) {
      return tmpDataRepository.deleteActiveMaterial({
        dataId: getDataId(filterParams),
        match: filterParams.match as Record<string, unknown> | undefined
      });
    }

    return MongoTmpData.deleteOne(getActiveFilter(filterParams), { session });
  },

  /** 读取仍在有效期内的材料，不主动改变材料生命周期。 */
  get: async <T extends Type>(
    params: VerificationGetParams<T>
  ): Promise<VerificationMaterial<T> | null> => {
    const { session, ...filterParams } = params;
    const result = session
      ? await findActiveRecord(filterParams, session)
      : await tmpDataRepository.findActiveMaterial({
          dataId: getDataId(filterParams),
          match: filterParams.match as Record<string, unknown> | undefined
        });

    return result ? (result.data as VerificationMaterial<T>) : null;
  },

  /** 判断材料是否仍在有效期内，用于区分未完成状态和已过期状态。 */
  hasActive: async <T extends Type>(params: VerificationGetParams<T>): Promise<boolean> => {
    const { session, ...filterParams } = params;
    const result = session
      ? await findActiveRecord(filterParams, session)
      : await tmpDataRepository.findActiveMaterial({
          dataId: getDataId(filterParams),
          match: filterParams.match as Record<string, unknown> | undefined
        });

    return Boolean(result);
  },

  /** 通过精确 dataId 候选查找唯一有效材料；多个候选命中视为数据冲突。 */
  findUniqueActiveDataId: async (dataIds: readonly string[]): Promise<string | null> => {
    const results = await tmpDataRepository.findActiveDataIds(dataIds);

    if (results.length > 1) {
      throw new Error('Verification material data id conflict');
    }

    return results[0] ?? null;
  },

  /** 在同一 Mongo 事务内读取材料、执行业务回调，并在回调成功后消费材料。 */
  consumeInTransaction: async <T extends Type, R>(
    params: VerificationConsumeParams<T>,
    handler: (context: VerificationConsumeContext<T>) => Promise<R>
  ): Promise<R> => {
    return mongoSessionRun(async (session) => {
      const record = await findActiveRecord(params, session);
      if (!record) {
        throw new VerificationMaterialError();
      }

      const result = await handler({
        material: record.data as VerificationMaterial<T>,
        session
      });

      const deleted = await MongoTmpData.deleteOne(getActiveFilter(params), { session });
      if (deleted.deletedCount !== 1) {
        throw new VerificationMaterialError();
      }

      return result;
    });
  }
};

const getActiveFilterParams = <T extends Type>(params: VerificationConsumeParams<T>) => ({
  dataId: getDataId(params),
  match: params.match as Record<string, unknown> | undefined
});

/**
 * 在同一 DAL 事务内读取材料、执行业务回调，并在回调成功后消费材料。
 *
 * 与 consumeInTransaction 的差异：事务上下文是 DAL TransactionContext，
 * 回调内只能使用 DAL Repository 访问数据库（旧 Model 无法参与 DAL 事务）。
 */
export const consumeInTransactionWithDal = async <T extends Type, R>(
  params: VerificationConsumeParams<T>,
  handler: (context: VerificationConsumeDalContext<T>) => Promise<R>
): Promise<R> => {
  return transactionRunner.withTransaction(async (dalContext) => {
    const filter = getActiveFilterParams(params);
    const record = await tmpDataRepository.findActiveMaterial(filter, dalContext);
    if (!record) {
      throw new VerificationMaterialError();
    }

    const result = await handler({
      material: record.data as VerificationMaterial<T>,
      dalContext
    });

    const deleted = await tmpDataRepository.deleteActiveMaterial(filter, dalContext);
    if (!deleted) {
      throw new VerificationMaterialError();
    }

    return result;
  });
};
