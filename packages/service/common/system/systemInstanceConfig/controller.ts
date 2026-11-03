import { assertStorageDownloadConfig } from '../../s3/config/utils';
import {
  type SystemInstanceConfigDomainKey,
  type SystemInstanceConfigDomainMap,
  getDomainDefaultConfig,
  parseDomainOverrides,
  resolveDomainEffectiveConfig,
  resolveSystemInstanceConfig,
  type SystemInstanceConfig
} from '@fastgpt/global/common/system/config/schema';
import {
  maskDomainSecrets,
  restorePreservedSecrets,
  getSystemEdition,
  getDomainSecretKeys,
  getDomainAllowedKeys,
  isConfigFieldAllowed,
  filterDomainDataByEdition
} from '@fastgpt/global/common/system/config/permission';
import {
  collectPrunedLeafPaths,
  hasOverridePath,
  pruneDefaultOverrides
} from '@fastgpt/global/common/system/config/merge';
import type { SystemInstanceConfigEdition } from '@fastgpt/global/common/system/config/registry';
import type {
  DeepPartial,
  SystemInstanceConfigUpdatedByType
} from '@fastgpt/global/common/system/config/type';
import { MongoSystemInstanceConfig } from './schema';
import { MongoSystemConfigs } from '../config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { SubPlanInputSchema, type SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import { mongoSessionRun } from '../../mongo/sessionRun';
import { ZodError } from 'zod';
import { ApiRequestInputParseError } from '../../zod/requestParseError';
import { serviceEnv } from '../../../env';
import {
  computeSystemInitBufferId,
  getInstanceConfigVersionTag,
  publishSystemInstanceConfigSnapshot
} from './runtime';
import { logInstanceConfigRead } from '../migrationCoverageLog';
import { ApiHttpError } from '../../http/apiError';

export type GetDomainConfigResult<T extends SystemInstanceConfigDomainKey> = {
  domain: T;
  revision: number;
  overrides: DeepPartial<SystemInstanceConfigDomainMap[T]>;
  effectiveConfig: SystemInstanceConfigDomainMap[T];
  updatedAt?: Date;
  updatedBy?: SystemInstanceConfigUpdatedByType;
};

/** Admin API 读取结果：配置数据按部署版本过滤，并附带可见的敏感字段路径列表。 */
export type AdminDomainConfigResult<T extends SystemInstanceConfigDomainKey> = {
  domain: T;
  revision: number;
  overrides: Partial<DeepPartial<SystemInstanceConfigDomainMap[T]>>;
  effectiveConfig: Partial<SystemInstanceConfigDomainMap[T]>;
  secretKeys: string[];
  updatedAt?: Date;
  updatedBy?: SystemInstanceConfigUpdatedByType;
};

/**
 * 服务端权威部署版本判定。
 * 与前端 feConfigs.isProService 同源：PRO_URL 存在即商业版，否则为开源社区版。
 */
export const getServiceEdition = (): SystemInstanceConfigEdition =>
  getSystemEdition(!!serviceEnv.PRO_URL);

/**
 * 列出提交 payload 中不属于当前部署版本的叶子路径，用于 Admin 写入边界的显式拒绝。
 * 开源版通过手工请求写入商业字段属于越权尝试，应报错而非静默丢弃，保证版本边界可审计
 * （设计文档 §6 规则 2）。
 * @param edition 缺省取服务端权威部署版本（PRO_URL 判定）
 */
export const findOverridesNotAllowedByEdition = (
  domain: SystemInstanceConfigDomainKey,
  submittedOverrides: Record<string, unknown>,
  edition: SystemInstanceConfigEdition = getServiceEdition()
): string[] => {
  if (edition === 'pro') {
    return [];
  }

  const allowedKeys = getDomainAllowedKeys(domain, edition);
  const offenders: string[] = [];

  const walk = (obj: Record<string, unknown>, currentPath = '') => {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      const path = currentPath ? `${currentPath}.${key}` : key;
      // 与 filterDomainDataByEdition 一致：仅对普通对象下钻，数组和标量按叶子处理
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof RegExp)
      ) {
        walk(value as Record<string, unknown>, path);
      } else if (!allowedKeys.has(path)) {
        offenders.push(path);
      }
    }
  };

  if (submittedOverrides && typeof submittedOverrides === 'object') {
    walk(submittedOverrides);
  }

  return offenders;
};

/**
 * Admin API 专用的 Domain 配置读取：在 getDomainConfig 基础上按部署版本过滤。
 * - effectiveConfig / overrides 剔除当前版本不允许的字段（防止社区版通过手工请求读取商业配置）
 * - secretKeys 同样按版本过滤，避免泄露商业字段路径
 * 版本边界必须由后端强制，不能只依赖前端隐藏（设计文档 §6 规则 2、§12 第 6 条）。
 * @param edition 缺省取服务端权威部署版本（PRO_URL 判定）
 */
export const getDomainConfigForAdmin = async <T extends SystemInstanceConfigDomainKey>(
  domain: T,
  edition: SystemInstanceConfigEdition = getServiceEdition()
): Promise<AdminDomainConfigResult<T>> => {
  return formatDomainConfigForAdmin(await getDomainConfig(domain), edition);
};

/** 将已读取或已提交的配置按版本过滤并脱敏；不再读库，保证保存响应对应本次 revision。 */
export const formatDomainConfigForAdmin = <T extends SystemInstanceConfigDomainKey>(
  result: GetDomainConfigResult<T>,
  edition: SystemInstanceConfigEdition
): AdminDomainConfigResult<T> => {
  const { domain } = result;
  const overrides = maskDomainSecrets(domain, result.overrides);
  const effectiveConfig = maskDomainSecrets(domain, result.effectiveConfig);

  const allowedSecretKeys = Array.from(getDomainSecretKeys(domain)).filter((relativeKey) =>
    isConfigFieldAllowed(`${domain}.${relativeKey}`, edition)
  );

  if (edition === 'pro') {
    return {
      domain: result.domain,
      revision: result.revision,
      overrides,
      effectiveConfig,
      secretKeys: allowedSecretKeys,
      updatedAt: result.updatedAt,
      updatedBy: result.updatedBy
    };
  }

  return {
    domain: result.domain,
    revision: result.revision,
    overrides: filterDomainDataByEdition(domain, overrides, edition),
    effectiveConfig: filterDomainDataByEdition(domain, effectiveConfig, edition),
    secretKeys: allowedSecretKeys,
    updatedAt: result.updatedAt,
    updatedBy: result.updatedBy
  };
};

export type UpdateDomainConfigParams<T extends SystemInstanceConfigDomainKey> = {
  domain: T;
  expectedRevision: number;
  submittedOverrides: DeepPartial<SystemInstanceConfigDomainMap[T]>;
  actor: SystemInstanceConfigUpdatedByType;
};

/** 「显式默认值」路径数量上限：防御异常输入把文档撑大。 */
const MAX_EXPLICIT_DEFAULT_PATHS = 200;

/**
 * 计算保存后要持久化的「显式默认值」路径集合。
 *
 * 稀疏 overrides 里缺一个键有两种含义：从未配置，或使用方明确清空/设回默认值。
 * 默认值剪枝会把后者也变成"缺键"（例如保存 scripts: [] 后 overrides 为空对象），
 * 因此必须把被剪掉的叶子路径单独记下来，迁移回填才能跳过使用方已经表达过意图的字段。
 *
 * - 提交了非默认值的路径：已回到 overrides，从集合中移除；
 * - 本次未提交的路径：保留原有意图，避免部分提交误删别人的记录。
 */
const resolveExplicitDefaultPaths = ({
  previousPaths,
  parsedOverrides,
  cleanOverrides
}: {
  previousPaths: string[];
  parsedOverrides: unknown;
  cleanOverrides: Record<string, unknown>;
}): string[] => {
  const next = new Set(previousPaths.filter((path) => !hasOverridePath(cleanOverrides, path)));

  for (const path of collectPrunedLeafPaths(parsedOverrides, cleanOverrides)) {
    next.add(path);
  }

  return [...next].slice(0, MAX_EXPLICIT_DEFAULT_PATHS);
};

const readExplicitDefaultPaths = (
  existing?: { explicitDefaultPaths?: string[] } | null
): string[] => (Array.isArray(existing?.explicitDefaultPaths) ? existing.explicitDefaultPaths : []);

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
  const doc = await MongoSystemInstanceConfig.findOne({ domain }).lean();

  const revision = doc?.revision ?? 0;
  const overrides = (doc?.overrides ?? {}) as DeepPartial<SystemInstanceConfigDomainMap[T]>;
  const effectiveConfig = resolveDomainEffectiveConfig(domain, overrides, { strict: false });

  logInstanceConfigRead({
    callsite: 'runtime.systemInstanceConfig.controller.getDomainConfig',
    source: 'admin-db',
    fields: [{ path: domain, value: effectiveConfig }]
  });

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
  const existing = await MongoSystemInstanceConfig.findOne({ domain }).lean();
  const currentRevision = existing?.revision ?? 0;

  if (currentRevision !== expectedRevision) {
    throw new ApiHttpError(
      409,
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

  // 5.1 记录被剪掉的显式默认值路径：让"明确清空"与"从未配置"在文档里可区分
  const explicitDefaultPaths = resolveExplicitDefaultPaths({
    previousPaths: readExplicitDefaultPaths(existing),
    parsedOverrides,
    cleanOverrides
  });

  // 6. 条件写入与乐观锁递增
  let updatedDoc;

  if (!existing) {
    // 首次插入，revision 初始化为 1
    try {
      const newDoc = new MongoSystemInstanceConfig({
        domain,
        revision: 1,
        overrides: cleanOverrides,
        explicitDefaultPaths,
        updatedBy: actor
      });
      await newDoc.save();
      updatedDoc = newDoc.toObject();
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ApiHttpError(409, 'Revision conflict: document was concurrently created');
      }
      throw err;
    }
  } else {
    updatedDoc = await MongoSystemInstanceConfig.findOneAndUpdate(
      { domain, revision: expectedRevision },
      {
        $set: {
          overrides: cleanOverrides,
          explicitDefaultPaths,
          updatedBy: actor,
          updatedAt: new Date()
        },
        $inc: { revision: 1 }
      },
      { new: true, runValidators: false }
    ).lean();

    if (!updatedDoc) {
      throw new ApiHttpError(409, 'Revision conflict: concurrent modification detected');
    }
  }

  const result = {
    domain,
    revision: updatedDoc.revision,
    overrides: cleanOverrides,
    effectiveConfig: nextEffectiveConfig,
    updatedAt: updatedDoc.updatedAt,
    updatedBy: updatedDoc.updatedBy
  };

  return result;
};

export type BatchUpdateItemInput = {
  domain: SystemInstanceConfigDomainKey;
  expectedRevision: number;
  overrides: Record<string, unknown>;
};

/**
 * 跨域批量原子保存：在单个 Mongo 事务中执行全域的 revision 校验与持久化。
 * 可选携带 subPlans（套餐），纳入同一事务与同一版本发布，杜绝商业配置与套餐分步提交留下的半写状态。
 * 任一域冲突、套餐写入失败或网络异常整体回滚。返回本次事务写入的数据，
 * 不等待运行时应用、不在提交后重新查询；刷新由业务入口和 Watch 负责。
 */
export const batchUpdateDomainConfigs = async ({
  items,
  subPlans,
  actor
}: {
  items: BatchUpdateItemInput[];
  subPlans?: Record<string, unknown>;
  actor: SystemInstanceConfigUpdatedByType;
}): Promise<GetDomainConfigResult<SystemInstanceConfigDomainKey>[]> => {
  if (items.length === 0 && subPlans === undefined) return [];

  /**
   * 将 Admin 套餐表单提交的扁平 subPlans 归一化为持久化的嵌套存储形状，并通过
   * SubPlanInputSchema 做权威校验（该 schema 与旧 updateConfig 保存链路同源，
   * 负责日期强转、积分包字段清洗与未知键剥离）。
   *
   * 历史形状是 Record 且字段集混杂（旧表单扁平键 + Pro 后端注入的嵌套键），
   * 新 commercial 页提交的仍是同样的扁平形状；若原样落库，
   * FastGPTConfigFileSchema 解析后 extraDatasetSize.price / extraPoints.packages
   * 等关键计费字段会被静默丢失。这里只做"扁平键 → 嵌套键"的最小搬运，
   * 其余字段透传给 schema 统一清洗，保证持久化形状唯一。
   */
  const normalizeSubPlansInput = (input: Record<string, unknown>): SubPlanType => {
    // 空输入经 RHF valueAsNumber 会产出 NaN/''/null；NaN 会让 NumSchema 整表
    // 校验失败，等价于"未配置"（对齐旧 adapt.ts 的 `|| 0` 兜底语义）
    const isFillable = (v: unknown) =>
      v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v));

    // 嵌套键优先：已是存储形状的记录（如从旧库回读后透传）不被扁平键覆盖
    const extraDatasetSize =
      input[SubTypeEnum.extraDatasetSize] ??
      (isFillable(input.extraDatasetSizePrice)
        ? { price: input.extraDatasetSizePrice }
        : undefined);
    const extraPoints =
      input[SubTypeEnum.extraPoints] ??
      (isFillable(input.extraPointsPackages) ? { packages: input.extraPointsPackages } : undefined);

    const { extraDatasetSizePrice, extraPointsPackages, ...rest } = input;

    return SubPlanInputSchema.parse({
      ...rest,
      ...(extraDatasetSize !== undefined
        ? { [SubTypeEnum.extraDatasetSize]: extraDatasetSize }
        : {}),
      ...(extraPoints !== undefined ? { [SubTypeEnum.extraPoints]: extraPoints } : {})
    });
  };

  // 套餐输入在进入事务前完成归一化：非法形状直接拒绝，避免半写状态与脏数据落库。
  // subPlans 来自 API body 透传（z.record 不校验内容），ZodError 包装为请求入参
  // 错误让入口层降级为 400，Admin 能定位具体字段而不是收到 500 原始 issues
  const normalizedSubPlans =
    subPlans === undefined
      ? undefined
      : (() => {
          try {
            return normalizeSubPlansInput(subPlans);
          } catch (error) {
            if (error instanceof ZodError) {
              throw new ApiRequestInputParseError(error, { inputSource: 'body' });
            }
            throw error;
          }
        })();

  // 1. 预校验与准备阶段：对所有域执行敏感字段恢复、形态校验、终审校验和默认值剪枝
  const preparedItems = await Promise.all(
    items.map(async ({ domain, expectedRevision, overrides: submittedOverrides }) => {
      const existing = await MongoSystemInstanceConfig.findOne({ domain }).lean();
      const currentRevision = existing?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        throw new ApiHttpError(
          409,
          `Revision conflict for domain "${domain}": current revision is ${currentRevision}, expected ${expectedRevision}`
        );
      }

      const rawOverrides = restorePreservedSecrets(domain, submittedOverrides, existing?.overrides);
      const parsedOverrides = parseDomainOverrides(domain, rawOverrides);
      const effectiveConfig = resolveDomainEffectiveConfig(domain, parsedOverrides);

      const defaultValues = getDomainDefaultConfig(domain);
      const cleanOverrides = pruneDefaultOverrides(parsedOverrides, defaultValues) ?? {};

      return {
        domain,
        existing,
        expectedRevision,
        cleanOverrides,
        effectiveConfig,
        explicitDefaultPaths: resolveExplicitDefaultPaths({
          previousPaths: readExplicitDefaultPaths(existing),
          parsedOverrides,
          cleanOverrides
        })
      };
    })
  );

  // 2. 事务执行阶段：在同一个 session 中执行所有文档的新建、带 revision 限制的更新以及套餐写入
  return mongoSessionRun(async (session) => {
    // 事务回调可能由 driver 重试；每次重新收集，避免返回已回滚尝试的 revision 或时间。
    const results: GetDomainConfigResult<SystemInstanceConfigDomainKey>[] = [];
    if (normalizedSubPlans !== undefined) {
      const latestFastgpt = await MongoSystemConfigs.findOne(
        { type: SystemConfigsTypeEnum.fastgpt },
        undefined,
        { session }
      ).sort({ createTime: -1 });

      await MongoSystemConfigs.create(
        [
          {
            type: SystemConfigsTypeEnum.fastgpt,
            value: {
              ...(latestFastgpt?.value ?? {}),
              subPlans: normalizedSubPlans
            },
            createTime: new Date()
          }
        ],
        { session, ordered: true }
      );
    }

    for (const item of preparedItems) {
      let updatedDoc;
      if (!item.existing) {
        const newDoc = new MongoSystemInstanceConfig({
          domain: item.domain,
          revision: 1,
          overrides: item.cleanOverrides,
          explicitDefaultPaths: item.explicitDefaultPaths,
          updatedBy: actor
        });
        await newDoc.save({ session });
        updatedDoc = newDoc.toObject();
      } else {
        updatedDoc = await MongoSystemInstanceConfig.findOneAndUpdate(
          { domain: item.domain, revision: item.expectedRevision },
          {
            $set: {
              overrides: item.cleanOverrides,
              explicitDefaultPaths: item.explicitDefaultPaths,
              updatedBy: actor,
              updatedAt: new Date()
            },
            $inc: { revision: 1 }
          },
          { session, new: true, runValidators: false }
        ).lean();

        if (!updatedDoc) {
          throw new ApiHttpError(
            409,
            `Revision conflict for domain "${item.domain}": concurrent modification detected`
          );
        }
      }
      results.push({
        domain: item.domain,
        revision: updatedDoc.revision,
        overrides: item.cleanOverrides,
        effectiveConfig: item.effectiveConfig,
        updatedAt: updatedDoc.updatedAt,
        updatedBy: updatedDoc.updatedBy
      });
    }
    return results;
  });
};

/**
 * 一次性获取所有 11 个 Domain 的最新配置合成快照。
 * 供服务启动、Worker 进程同步以及全局运行时配置读取。
 * 发生错误时向上抛出，保留调用方已有的上一成功快照，绝不降级覆盖为全默认配置。
 *
 * 只按「Schema 默认值 + 数据库 overrides」合成，不再拼接 ENV；旧 ENV 只在首次迁移时写入。
 */
export const getSystemInstanceConfigSnapshot = async (): Promise<{
  snapshot: SystemInstanceConfig;
  versionTag: string;
}> => {
  const docs = await MongoSystemInstanceConfig.find({}).lean();

  const versionTag =
    docs
      .map((d) => `${(d as any).domain ?? d._id}:${d.revision ?? 0}`)
      .sort()
      .join(';') || '0';

  const domainOverridesMap: Partial<Record<SystemInstanceConfigDomainKey, unknown>> = {};
  for (const doc of docs) {
    const domainKey = ((doc as any).domain ?? doc._id) as SystemInstanceConfigDomainKey;
    domainOverridesMap[domainKey] = doc.overrides;
  }

  const snapshot = resolveSystemInstanceConfig(domainOverridesMap, { strict: false });
  logInstanceConfigRead({
    callsite: 'startup.systemInstanceConfig.getSystemInstanceConfigSnapshot',
    fields: [
      { path: 'site', value: snapshot.site },
      { path: 'auth', value: snapshot.auth },
      { path: 'security', value: snapshot.security },
      { path: 'feature', value: snapshot.feature },
      { path: 'commercial', value: snapshot.commercial },
      { path: 'resource', value: snapshot.resource },
      { path: 'performance', value: snapshot.performance },
      { path: 'storage', value: snapshot.storage },
      { path: 'vector', value: snapshot.vector },
      { path: 'providers', value: snapshot.providers },
      { path: 'subservice', value: snapshot.subservice }
    ]
  });
  return { snapshot, versionTag };
};

/**
 * 重新加载并刷新系统实例配置内存快照。
 * 供服务启动、Admin API 保存后以及集群变更通知时调用。
 */
export const reloadSystemInstanceConfig = async (): Promise<SystemInstanceConfig> => {
  const { snapshot, versionTag } = await getSystemInstanceConfigSnapshot();
  // 环境变量仅提供基础设施 vendor；下载策略来自已加载配置，校验失败保留旧快照。
  assertStorageDownloadConfig(snapshot.storage);
  publishSystemInstanceConfigSnapshot({ snapshot, versionTag });
  global.systemInitBufferId = computeSystemInitBufferId({
    instanceVersionTag: getInstanceConfigVersionTag(),
    licenseUpdateTime: (global.licenseData as any)?.expiredTime
      ? new Date((global.licenseData as any).expiredTime).getTime()
      : undefined
  });
  return snapshot;
};
