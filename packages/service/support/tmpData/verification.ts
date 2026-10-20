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

/** 与 params 逐位绑定的材料元组类型，消费回调无需靠下标断言恢复元素类型。 */
export type VerificationConsumeManyMaterialsFor<Types extends readonly Type[]> = {
  [K in keyof Types]: VerificationMaterial<Types[K]>;
};

export type VerificationConsumeManyContextFor<Types extends readonly Type[]> = {
  materials: VerificationConsumeManyMaterialsFor<Types>;
  session: ClientSession;
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

/** 事务内批量读取时用到的最小记录视图，只保留校验材料归属需要的字段。 */
type VerificationRecord = {
  dataId: string;
  data: unknown;
};

/** 根据统一 TTL 档位计算材料过期时间，避免业务层自行构造 Date。 */
const getExpireAt = (ttlPreset: VerificationTtlPreset) =>
  new Date(Date.now() + VerificationTtlSeconds[ttlPreset] * 1000);

const isMongoDuplicateKeyError = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 11000;

/**
 * 把存储层读出的记录收窄为与 params 逐位绑定的材料元组。
 *
 * tmp_datas 的 data 列没有静态类型，位置 i 的材料类型由 params[i] 决定，因此这里集中承担对存储层
 * 的信任：逐条校验记录存在、且 dataId 与请求的 scene/type/key 完全一致，任一不符都视为材料无效，
 * 由上层回滚整个事务。校验通过后只做一次元组断言，调用点无需各自写 `as`。
 *
 * dataId 比对不是冗余：它确认“位置 i 拿到的就是 params[i] 的材料”，一旦查询条件被放宽（例如改成
 * $in 候选批量查询）或读取顺序与 params 不一致，这里会立即失败，而不是把错类型的材料交给回调。
 * 材料形态不在此校验：wechat 等材料的 data 合法地为 null。
 */
const toMaterialTupleFor = <Types extends readonly Type[]>(
  params: { [K in keyof Types]: VerificationConsumeParams<Types[K]> },
  records: readonly (VerificationRecord | null)[]
): VerificationConsumeManyMaterialsFor<Types> => {
  const materials = params.map((item, index) => {
    const record = records[index];
    if (!record || record.dataId !== getDataId(item)) {
      throw new VerificationMaterialError();
    }

    return record.data;
  });

  // 逐条校验已确认位置与 params 对齐，此处断言只是把 unknown 数组交回元组类型。
  return materials as VerificationConsumeManyMaterialsFor<Types>;
};

/**
 * 在同一 Mongo 事务内消费多个互相绑定的验证材料。
 * 任一材料不存在、过期或已被并发请求消费，整个事务都会回滚。
 * params 与回调 materials 按位置逐位绑定类型，交换 params 顺序会在编译期报错。
 */
const consumeManyInTransaction = async <Types extends readonly Type[], R>(
  params: { [K in keyof Types]: VerificationConsumeParams<Types[K]> },
  handler: (context: VerificationConsumeManyContextFor<Types>) => Promise<R>
): Promise<R> =>
  mongoSessionRun(async (session) => {
    // MongoDB 不允许在同一事务 session 上并行执行操作，按材料顺序串行读取。
    const records: (VerificationRecord | null)[] = [];
    for (const item of params) {
      records.push(await findActiveRecord(item, session));
    }

    const materials = toMaterialTupleFor(params, records);

    const result = await handler({
      materials,
      session
    });

    for (const item of params) {
      const deleted = await MongoTmpData.deleteOne(getActiveFilter(item), { session });
      if (deleted.deletedCount !== 1) {
        throw new VerificationMaterialError();
      }
    }

    return result;
  });

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
    const sessionOptions = params.session ? { session: params.session } : {};

    await MongoTmpData.deleteOne(
      {
        dataId,
        expireAt: { $lte: new Date() }
      },
      sessionOptions
    );

    try {
      await MongoTmpData.create(
        [
          {
            dataId,
            data: params.data,
            expireAt: getExpireAt(params.ttlPreset)
          }
        ],
        sessionOptions
      );
      return true;
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) return false;
      throw error;
    }
  },

  /** 覆盖同一场景、类型和 key 的材料，并刷新过期时间。 */
  upsert: async <T extends Type>(params: VerificationUpsertParams<T>) => {
    const dataId = getDataId(params);

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

    return MongoTmpData.deleteOne(getActiveFilter(filterParams), {
      ...(session ? { session } : {})
    });
  },

  /** 读取仍在有效期内的材料，不主动改变材料生命周期。 */
  get: async <T extends Type>(
    params: VerificationGetParams<T>
  ): Promise<VerificationMaterial<T> | null> => {
    const { session, ...filterParams } = params;
    const result = await findActiveRecord(filterParams, session);

    return result ? (result.data as VerificationMaterial<T>) : null;
  },

  /** 判断材料是否仍在有效期内，用于区分未完成状态和已过期状态。 */
  hasActive: async <T extends Type>(params: VerificationGetParams<T>): Promise<boolean> => {
    const { session, ...filterParams } = params;
    const result = await findActiveRecord(filterParams, session);

    return Boolean(result);
  },

  /** 通过精确 dataId 候选查找唯一有效材料；多个候选命中视为数据冲突。 */
  findUniqueActiveDataId: async (dataIds: readonly string[]): Promise<string | null> => {
    const results = await MongoTmpData.find({
      dataId: { $in: [...new Set(dataIds)] },
      expireAt: { $gt: new Date() }
    })
      .select({ dataId: 1 })
      .limit(2)
      .lean();

    if (results.length > 1) {
      throw new Error('Verification material data id conflict');
    }

    return results[0]?.dataId ?? null;
  },

  /** 在同一 Mongo 事务内读取材料、执行业务回调，并在回调成功后消费材料。 */
  consumeInTransaction: async <T extends Type, R>(
    params: VerificationConsumeParams<T>,
    handler: (context: VerificationConsumeContext<T>) => Promise<R>
  ): Promise<R> => {
    // 显式声明单元素元组，保证 materials[0] 的类型与 params 绑定，无需断言。
    return consumeManyInTransaction<[T], R>([params], async ({ materials, session }) =>
      handler({
        material: materials[0],
        session
      })
    );
  },

  consumeManyInTransaction
};
