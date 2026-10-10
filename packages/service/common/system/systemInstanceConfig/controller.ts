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
import type {
  SystemInstanceConfigEdition,
  SystemInstanceConfigRegistryItem
} from '@fastgpt/global/common/system/config/registry';
import type {
  DeepPartial,
  SystemInstanceConfigUpdatedByType
} from '@fastgpt/global/common/system/config/type';
import { MongoSystemInstanceConfig } from './schema';
import { MongoSystemConfigs } from '../config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { mongoSessionRun } from '../../mongo/sessionRun';
import { serviceEnv } from '../../../env';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.SYSTEM);

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
  const result = await getDomainConfig(domain, { maskSecrets: true });

  const allowedSecretKeys = Array.from(getDomainSecretKeys(domain)).filter((relativeKey) =>
    isConfigFieldAllowed(`${domain}.${relativeKey}`, edition)
  );

  if (edition === 'pro') {
    return {
      domain: result.domain,
      revision: result.revision,
      overrides: result.overrides,
      effectiveConfig: result.effectiveConfig,
      secretKeys: allowedSecretKeys,
      updatedAt: result.updatedAt,
      updatedBy: result.updatedBy
    };
  }

  return {
    domain: result.domain,
    revision: result.revision,
    overrides: filterDomainDataByEdition(domain, result.overrides, edition),
    effectiveConfig: filterDomainDataByEdition(domain, result.effectiveConfig, edition),
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
  const doc = await MongoSystemInstanceConfig.findById(domain).lean();

  const revision = doc?.revision ?? 0;
  const overrides = (doc?.overrides ?? {}) as DeepPartial<SystemInstanceConfigDomainMap[T]>;
  const effectiveConfig = resolveDomainEffectiveConfig(domain, overrides);

  if (domain === 'subservice') {
    const subserviceConfig = effectiveConfig as SystemInstanceConfigDomainMap['subservice'];
    if (serviceEnv.AIPROXY_API_ENDPOINT) {
      subserviceConfig.aiProxy.endpoint = serviceEnv.AIPROXY_API_ENDPOINT;
    }
    if (serviceEnv.CODE_SANDBOX_URL) {
      subserviceConfig.codeSandbox.baseUrl = serviceEnv.CODE_SANDBOX_URL;
    }
    if (serviceEnv.PLUGIN_BASE_URL) {
      subserviceConfig.plugin.baseUrl = serviceEnv.PLUGIN_BASE_URL;
    }
    if (serviceEnv.AGENT_SANDBOX_PROXY_URL && !subserviceConfig.agentSandbox.proxy.wsUrl) {
      subserviceConfig.agentSandbox.proxy.wsUrl = serviceEnv.AGENT_SANDBOX_PROXY_URL;
    }
    if (
      serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL &&
      !subserviceConfig.agentSandbox.proxy.httpUrl
    ) {
      subserviceConfig.agentSandbox.proxy.httpUrl = serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL;
    }
  }

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
        _id: domain,
        revision: 1,
        overrides: cleanOverrides,
        explicitDefaultPaths,
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
          explicitDefaultPaths,
          updatedBy: actor,
          updatedAt: new Date()
        },
        $inc: { revision: 1 }
      },
      { new: true, runValidators: false }
    ).lean();

    if (!updatedDoc) {
      throw new Error('Revision conflict: concurrent modification detected');
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

  // 写入成功后即时刷新单例快照：必须成功应用才返回，
  // 失败保留上一成功快照并向外抛错，避免保存成功与运行时状态脱节。
  await reloadSystemInstanceConfig();

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
 * 任一域冲突、套餐写入失败或网络异常整体回滚。
 */
export const batchUpdateDomainConfigs = async ({
  items,
  subPlans,
  actor
}: {
  items: BatchUpdateItemInput[];
  subPlans?: Record<string, unknown>;
  actor: SystemInstanceConfigUpdatedByType;
}): Promise<SystemInstanceConfigDomainKey[]> => {
  if (items.length === 0 && subPlans === undefined) return [];

  // 1. 预校验与准备阶段：对所有域执行敏感字段恢复、形态校验、终审校验和默认值剪枝
  const preparedItems = await Promise.all(
    items.map(async ({ domain, expectedRevision, overrides: submittedOverrides }) => {
      const existing = await MongoSystemInstanceConfig.findById(domain).lean();
      const currentRevision = existing?.revision ?? 0;
      if (currentRevision !== expectedRevision) {
        throw new Error(
          `Revision conflict for domain "${domain}": current revision is ${currentRevision}, expected ${expectedRevision}`
        );
      }

      const rawOverrides = restorePreservedSecrets(domain, submittedOverrides, existing?.overrides);
      const parsedOverrides = parseDomainOverrides(domain, rawOverrides);
      resolveDomainEffectiveConfig(domain, parsedOverrides);

      const defaultValues = getDomainDefaultConfig(domain);
      const cleanOverrides = pruneDefaultOverrides(parsedOverrides, defaultValues) ?? {};

      return {
        domain,
        existing,
        expectedRevision,
        cleanOverrides,
        explicitDefaultPaths: resolveExplicitDefaultPaths({
          previousPaths: readExplicitDefaultPaths(existing),
          parsedOverrides,
          cleanOverrides
        })
      };
    })
  );

  // 2. 事务执行阶段：在同一个 session 中执行所有文档的新建、带 revision 限制的更新以及套餐写入
  await mongoSessionRun(async (session) => {
    if (subPlans !== undefined) {
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
              subPlans
            },
            createTime: new Date()
          }
        ],
        { session, ordered: true }
      );
    }

    for (const item of preparedItems) {
      if (!item.existing) {
        const newDoc = new MongoSystemInstanceConfig({
          _id: item.domain,
          revision: 1,
          overrides: item.cleanOverrides,
          explicitDefaultPaths: item.explicitDefaultPaths,
          updatedBy: actor
        });
        await newDoc.save({ session });
      } else {
        const updatedDoc = await MongoSystemInstanceConfig.findOneAndUpdate(
          { _id: item.domain, revision: item.expectedRevision },
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
          throw new Error(
            `Revision conflict for domain "${item.domain}": concurrent modification detected`
          );
        }
      }
    }
  });

  // 3. 事务成功后即时刷新单例快照：必须成功应用才返回，
  // 失败保留上一成功快照并向外抛错，避免保存成功与运行时状态脱节。
  await reloadSystemInstanceConfig();

  return preparedItems.map((item) => item.domain);
};

let currentSnapshot: SystemInstanceConfig | null = null;
let currentInstanceVersionTag = '0';

/** 获取基于所有 Domain 文档当前 revision 聚合生成的确定性版本标识 */
export const getInstanceConfigVersionTag = (): string => currentInstanceVersionTag;

/**
 * 统一计算系统全局初始化缓存标记（systemInitBufferId）。
 * 结合实例配置版本签名、授权版本时间戳和套餐版本时间戳，确保多节点确定性一致，
 * 避免不同节点各自使用 Date.now() 或各并行任务先后覆写产生竞态。
 */
export const computeSystemInitBufferId = ({
  instanceVersionTag = currentInstanceVersionTag,
  licenseUpdateTime,
  subPlansUpdateTime
}: {
  instanceVersionTag?: string;
  licenseUpdateTime?: number;
  subPlansUpdateTime?: number;
} = {}): string => {
  const licenseTag = licenseUpdateTime ?? 0;
  const subPlansTag = subPlansUpdateTime ?? 0;
  return `v_${instanceVersionTag}_l_${licenseTag}_p_${subPlansTag}`;
};

/**
 * 一次性获取所有 11 个 Domain 的最新配置合成快照。
 * 供服务启动、Worker 进程同步以及全局运行时配置读取。
 * 发生错误时向上抛出，保留调用方已有的上一成功快照，绝不降级覆盖为全默认配置。
 */
export const getSystemInstanceConfigSnapshot = async (): Promise<SystemInstanceConfig> => {
  const docs = await MongoSystemInstanceConfig.find({}).lean();

  const versionSig = docs
    .map((d) => `${d._id}:${d.revision ?? 0}`)
    .sort()
    .join(';');
  currentInstanceVersionTag = versionSig || '0';

  const domainOverridesMap: Partial<Record<SystemInstanceConfigDomainKey, unknown>> = {};
  for (const doc of docs) {
    domainOverridesMap[doc._id as SystemInstanceConfigDomainKey] = doc.overrides;
  }

  const snapshot = resolveSystemInstanceConfig(domainOverridesMap);
  if (serviceEnv.AIPROXY_API_ENDPOINT && snapshot.subservice?.aiProxy) {
    snapshot.subservice.aiProxy.endpoint = serviceEnv.AIPROXY_API_ENDPOINT;
  }
  if (serviceEnv.CODE_SANDBOX_URL && snapshot.subservice?.codeSandbox) {
    snapshot.subservice.codeSandbox.baseUrl = serviceEnv.CODE_SANDBOX_URL;
  }
  if (serviceEnv.PLUGIN_BASE_URL && snapshot.subservice?.plugin) {
    snapshot.subservice.plugin.baseUrl = serviceEnv.PLUGIN_BASE_URL;
  }
  if (
    serviceEnv.AGENT_SANDBOX_PROXY_URL &&
    snapshot.subservice?.agentSandbox?.proxy &&
    !snapshot.subservice.agentSandbox.proxy.wsUrl
  ) {
    snapshot.subservice.agentSandbox.proxy.wsUrl = serviceEnv.AGENT_SANDBOX_PROXY_URL;
  }
  if (
    serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL &&
    snapshot.subservice?.agentSandbox?.proxy &&
    !snapshot.subservice.agentSandbox.proxy.httpUrl
  ) {
    snapshot.subservice.agentSandbox.proxy.httpUrl = serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL;
  }
  return snapshot;
};

/**
 * 同步获取当前内存中的系统实例配置快照。
 * 若尚未完成启动加载，则返回 Schema 定义的初始默认值，保证业务无锁直接调用且永不为 null。
 */
export const getSystemInstanceConfig = (): SystemInstanceConfig => {
  if (!currentSnapshot) {
    if (global.systemInstanceConfig) {
      currentSnapshot = global.systemInstanceConfig;
    } else {
      currentSnapshot = resolveSystemInstanceConfig({});
      global.systemInstanceConfig = currentSnapshot;
    }
  }
  return currentSnapshot;
};

/**
 * 重新加载并刷新系统实例配置内存快照。
 * 供服务启动、Admin API 保存后以及集群变更通知时调用。
 */
export const reloadSystemInstanceConfig = async (): Promise<SystemInstanceConfig> => {
  const snapshot = await getSystemInstanceConfigSnapshot();
  currentSnapshot = snapshot;
  global.systemInstanceConfig = snapshot;
  global.systemInitBufferId = computeSystemInitBufferId({
    instanceVersionTag: currentInstanceVersionTag,
    licenseUpdateTime: (global.licenseData as any)?.expiredTime
      ? new Date((global.licenseData as any).expiredTime).getTime()
      : undefined
  });
  return snapshot;
};
