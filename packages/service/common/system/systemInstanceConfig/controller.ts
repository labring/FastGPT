import {
  type SystemInstanceConfigDomainKey,
  type SystemInstanceConfigDomainMap,
  type SystemInstanceConfig,
  getDomainDefaultConfig,
  parseDomainOverrides,
  resolveDomainEffectiveConfig,
  resolveSystemInstanceConfig,
  maskDomainSecrets,
  restorePreservedSecrets,
  pruneDefaultOverrides
} from '@fastgpt/global/common/system/config';
import type {
  DeepPartial,
  SystemInstanceConfigUpdatedByType
} from '@fastgpt/global/common/system/config/type';
import { MongoSystemInstanceConfig } from './schema';

export type GetDomainConfigResult<T extends SystemInstanceConfigDomainKey> = {
  domain: T;
  revision: number;
  overrides: DeepPartial<SystemInstanceConfigDomainMap[T]>;
  effectiveConfig: SystemInstanceConfigDomainMap[T];
  updatedAt?: Date;
  updatedBy?: SystemInstanceConfigUpdatedByType;
};

export type UpdateDomainConfigParams<T extends SystemInstanceConfigDomainKey> = {
  domain: T;
  expectedRevision: number;
  submittedOverrides: DeepPartial<SystemInstanceConfigDomainMap[T]>;
  actor: SystemInstanceConfigUpdatedByType;
};

/**
 * 获取指定 Domain 的配置。
 * 若数据库中不存在记录，则返回内置默认配置及 revision: 0。
 * @param domain 配置域标识
 * @param options.maskSecrets 是否对敏感字段脱敏（掩码为 '******'），供 API 返回时使用
 */
export const getDomainConfig = async <T extends SystemInstanceConfigDomainKey>(
  domain: T,
  options?: { maskSecrets?: boolean }
): Promise<GetDomainConfigResult<T>> => {
  const doc = await MongoSystemInstanceConfig.findById(domain).lean();

  const revision = doc?.revision ?? 0;
  const overrides = (doc?.overrides ?? {}) as DeepPartial<SystemInstanceConfigDomainMap[T]>;
  const effectiveConfig = resolveDomainEffectiveConfig(domain, overrides);

  if (options?.maskSecrets) {
    return {
      domain,
      revision,
      overrides: maskDomainSecrets(domain, overrides),
      effectiveConfig: maskDomainSecrets(domain, effectiveConfig),
      updatedAt: doc?.updatedAt,
      updatedBy: doc?.updatedBy
    };
  }

  return {
    domain,
    revision,
    overrides,
    effectiveConfig,
    updatedAt: doc?.updatedAt,
    updatedBy: doc?.updatedBy
  };
};

/**
 * 保存并更新指定 Domain 的稀疏覆盖配置。
 * 包含两阶段校验、敏感数据防丢失恢复、默认值冗余剪枝及乐观锁并发控制。
 */
export const updateDomainConfig = async <T extends SystemInstanceConfigDomainKey>({
  domain,
  expectedRevision,
  submittedOverrides,
  actor
}: UpdateDomainConfigParams<T>): Promise<GetDomainConfigResult<T>> => {
  // 1. 查询当前已有文档，检查版本并用于恢复敏感字段
  const existing = await MongoSystemInstanceConfig.findById(domain).lean();
  const currentRevision = existing?.revision ?? 0;

  if (currentRevision !== expectedRevision) {
    throw new Error(
      `Revision conflict: current revision is ${currentRevision}, expected ${expectedRevision}`
    );
  }

  // 2. 敏感数据防覆盖处理：若用户提交了 '******' 掩码，则自动恢复库中已有值
  const rawOverrides = restorePreservedSecrets(domain, submittedOverrides, existing?.overrides);

  // 3. 阶段 1 校验：检查 overrides 本身的形态与字段类型（拒绝未知字段）
  const parsedOverrides = parseDomainOverrides(domain, rawOverrides);

  // 4. 阶段 2 终审校验：合并完整默认值并执行 superRefine 跨字段校验
  const nextEffectiveConfig = resolveDomainEffectiveConfig(domain, parsedOverrides);

  // 5. 冗余剪枝：与内置默认值完全相同的项不进入 DB
  const defaultValues = getDomainDefaultConfig(domain);
  const cleanOverrides = (pruneDefaultOverrides(parsedOverrides, defaultValues) ??
    {}) as DeepPartial<SystemInstanceConfigDomainMap[T]>;

  // 6. 条件写入与乐观锁递增
  let updatedDoc;

  if (!existing) {
    // 首次插入，revision 初始化为 1
    try {
      const newDoc = new MongoSystemInstanceConfig({
        _id: domain,
        revision: 1,
        overrides: cleanOverrides,
        updatedBy: actor
      });
      await newDoc.save();
      updatedDoc = newDoc.toObject();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new Error('Revision conflict: document was concurrently created');
      }
      throw err;
    }
  } else {
    updatedDoc = await MongoSystemInstanceConfig.findOneAndUpdate(
      { _id: domain, revision: expectedRevision },
      {
        $set: {
          overrides: cleanOverrides,
          updatedBy: actor,
          updatedAt: new Date()
        },
        $inc: { revision: 1 }
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedDoc) {
      throw new Error('Revision conflict: concurrent modification detected');
    }
  }

  return {
    domain,
    revision: updatedDoc.revision,
    overrides: cleanOverrides,
    effectiveConfig: nextEffectiveConfig,
    updatedAt: updatedDoc.updatedAt,
    updatedBy: updatedDoc.updatedBy
  };
};

/**
 * 一次性获取所有 11 个 Domain 的最新配置合成快照。
 * 供服务启动、Worker 进程同步以及全局运行时配置读取。
 */
export const getSystemInstanceConfigSnapshot = async (): Promise<SystemInstanceConfig> => {
  const docs = await MongoSystemInstanceConfig.find({}).lean();

  const domainOverridesMap: Partial<Record<SystemInstanceConfigDomainKey, unknown>> = {};
  for (const doc of docs) {
    domainOverridesMap[doc._id as SystemInstanceConfigDomainKey] = doc.overrides;
  }

  return resolveSystemInstanceConfig(domainOverridesMap);
};
