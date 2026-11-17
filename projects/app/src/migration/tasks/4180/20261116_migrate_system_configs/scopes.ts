import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import {
  SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
  resolveDomainEffectiveConfig
} from '@fastgpt/global/common/system/config/schema';
import {
  ActivityAdConfigSchema,
  OperationalAdConfigSchema,
  SystemMsgModalConfigSchema,
  systemInstanceConfigScopeSchemaMap
} from '@fastgpt/global/common/system/config/scopes';
import { SubPlanInputSchema } from '@fastgpt/global/support/wallet/sub/type';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  decryptDomainSecrets,
  encryptDomainSecrets
} from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import {
  MongoTransactionConflictError,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import type { z } from 'zod';

const LEGACY_INSTANCE_ID = '000000000000000000000001';
const STANDALONE_SCOPES = [
  SystemConfigsTypeEnum.license,
  SystemConfigsTypeEnum.instanceId,
  SystemConfigsTypeEnum.modelStatusProbe,
  SystemConfigsTypeEnum.moderationPolicy
] as const;
const MERGED_SCOPES = [
  SystemConfigsTypeEnum.subPlans,
  SystemConfigsTypeEnum.systemMsgModal,
  SystemConfigsTypeEnum.operationalAd,
  SystemConfigsTypeEnum.activityAd
] as const;
const LEGACY_SCOPES = [...STANDALONE_SCOPES, ...MERGED_SCOPES] as const;
type LegacyScope = (typeof LEGACY_SCOPES)[number];
type MergedScope = (typeof MERGED_SCOPES)[number];
type TargetScope = (typeof STANDALONE_SCOPES)[number] | 'commercial' | 'operations';

const mergedScopeSchemas = {
  subPlans: SubPlanInputSchema,
  systemMsgModal: SystemMsgModalConfigSchema,
  operationalAd: OperationalAdConfigSchema,
  activityAd: ActivityAdConfigSchema
} satisfies Record<MergedScope, z.ZodType>;

/** 套餐输入需归一化已知数字字段，同时保留旧版本 Schema 未识别的字段。 */
const mergeNormalizedPlans = (source: unknown, normalized: unknown): unknown => {
  if (normalized === undefined) return source;
  if (Array.isArray(source) && Array.isArray(normalized)) {
    return normalized.map((item, index) => mergeNormalizedPlans(source[index], item));
  }
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  if (isPlainObject(source) && isPlainObject(normalized)) {
    const merged = { ...source };
    for (const [key, value] of Object.entries(normalized)) {
      merged[key] = mergeNormalizedPlans(source[key], value);
    }
    return merged;
  }
  return normalized;
};

/** 只报告 schema 字段路径，不能把历史授权码、密钥或配置正文写入迁移日志。 */
const validateSchema = ({
  name,
  schema,
  value
}: {
  name: string;
  schema: z.ZodType;
  value: unknown;
}) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path.join('.') || '<root>');
    throw new Error(`Invalid configuration scope ${name} fields: ${paths.join(', ')}`);
  }
  return result.data;
};

/** 校验整份目标配置，包括商业域的稀疏结构与合并默认值后的完整结构。 */
const validateTarget = (domain: TargetScope | 'proEnv', overrides: unknown) => {
  const decoded =
    domain === 'commercial' || domain === 'modelStatusProbe'
      ? decryptDomainSecrets(domain, overrides)
      : overrides;
  if (domain === 'commercial') {
    try {
      resolveDomainEffectiveConfig({ domain, overrides: decoded });
    } catch (error) {
      const issues = (error as { issues?: { path: PropertyKey[] }[] }).issues;
      const paths = issues?.map((issue) => issue.path.join('.') || '<root>') ?? ['<root>'];
      throw new Error(`Invalid configuration scope ${domain} fields: ${paths.join(', ')}`);
    }
    return;
  }
  validateSchema({
    name: domain,
    schema: systemInstanceConfigScopeSchemaMap[domain],
    value: decoded
  });
};

/**
 * 按旧写入语义选权威记录：实例 ID 的固定主键优先，其余按时间和主键稳定排序。
 * 缺失独立套餐时才回退到最后一条 fastgpt 快照；Langfuse 仅使用各进程 ENV，不迁移。
 */
const readLegacyScopeSources = async ({
  domains,
  session
}: {
  domains: readonly LegacyScope[];
  session?: ClientSession;
}) => {
  const sources: Partial<Record<LegacyScope, unknown>> = {};
  const present = new Set<LegacyScope>();
  const readLatest = (type: SystemConfigsTypeEnum) =>
    MongoSystemConfigs.findOne({ type })
      .sort({ createTime: -1, _id: -1 })
      .session(session ?? null)
      .lean();

  for (const domain of domains) {
    const fixedIdRecord =
      domain === SystemConfigsTypeEnum.instanceId
        ? await MongoSystemConfigs.findOne({ _id: LEGACY_INSTANCE_ID, type: domain })
            .session(session ?? null)
            .lean()
        : undefined;
    const record = fixedIdRecord ?? (await readLatest(domain));
    if (record) {
      sources[domain] = record.value;
      present.add(domain);
    }
  }

  const needsPlans =
    domains.includes(SystemConfigsTypeEnum.subPlans) &&
    !present.has(SystemConfigsTypeEnum.subPlans);
  if (needsPlans) {
    const legacy = await MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgpt })
      .sort({ type: 1, _id: -1 })
      .session(session ?? null)
      .lean();
    if (needsPlans && legacy?.value?.subPlans !== undefined) {
      sources.subPlans = legacy.value.subPlans;
      present.add(SystemConfigsTypeEnum.subPlans);
    }
  }
  return { sources, present };
};

/**
 * 合并历史 scope 时，已有整个子对象即代表管理员意图；仅对象缺失时才补充旧源。
 * 如果仅显式默认路径存在，过滤对应分支，不能把用户清除的旧值重新写回。
 */
const withoutExplicitDefaults = ({
  value,
  path,
  markers
}: {
  value: unknown;
  path: string;
  markers: string[];
}): unknown => {
  if (markers.some((marker) => path === marker || path.startsWith(`${marker}.`))) return undefined;
  const hasDescendant = markers.some((marker) => marker.startsWith(`${path}.`));
  if (!hasDescendant) return value;
  if (
    Array.isArray(value) ||
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date
  ) {
    // 数组与标量是原子值，不能覆盖其子路径上的明确默认意图。
    return undefined;
  }
  const entries = Object.entries(value);
  const kept = entries.flatMap(([key, child]) => {
    const next = withoutExplicitDefaults({ value: child, path: `${path}.${key}`, markers });
    return next === undefined ? [] : [[key, next]];
  });
  // 子树被全部标记时删除空父节点，避免制造缺少必填字段的不完整对象。
  return kept.length === 0 && entries.length > 0 ? undefined : Object.fromEntries(kept);
};

/** 为一次事务准备全部校验后的确定性补缺，终验使用同一规则检测遗漏。 */
const prepareScopeMigration = async (session?: ClientSession) => {
  const targets = await MongoSystemInstanceConfig.find({
    domain: { $in: [...STANDALONE_SCOPES, 'commercial', 'operations', 'proEnv'] }
  })
    .session(session ?? null)
    .lean();
  // 开发期间已写入的旧 scope 不再属于新模型枚举，直接读取原始集合。
  const legacyInstances = await MongoSystemInstanceConfig.collection
    .find({ domain: { $in: [...MERGED_SCOPES] } }, { session })
    .toArray();
  // 商业域与模型探测均含密钥，校验和合并前先恢复业务值。
  const targetByDomain = new Map(
    targets.map((doc) => [
      doc.domain,
      {
        ...doc,
        overrides:
          doc.domain === 'commercial' || doc.domain === 'modelStatusProbe'
            ? decryptDomainSecrets(doc.domain, doc.overrides)
            : doc.overrides
      }
    ])
  );
  const storedOverridesByDomain = new Map(targets.map((doc) => [doc.domain, doc.overrides]));
  const legacyByDomain = new Map(legacyInstances.map((doc) => [doc.domain, doc]));
  const getMarkers = (value: unknown, domain: string): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((path) => typeof path !== 'string' || path === '')) {
      throw new Error(`Invalid configuration scope ${domain} fields: explicitDefaultPaths`);
    }
    return value;
  };

  for (const target of targetByDomain.values()) {
    validateTarget(target.domain as TargetScope | 'proEnv', target.overrides);
    getMarkers(target.explicitDefaultPaths, target.domain);
  }

  const getTargetDomain = (scope: LegacyScope): TargetScope => {
    if (scope === 'subPlans') return 'commercial';
    if (MERGED_SCOPES.some((item) => item === scope)) return 'operations';
    return scope as (typeof STANDALONE_SCOPES)[number];
  };
  const isSatisfied = (scope: LegacyScope) => {
    const domain = getTargetDomain(scope);
    const target = targetByDomain.get(domain);
    if (!MERGED_SCOPES.some((item) => item === scope)) return target !== undefined;
    if (!target) return false;
    const overrides = target.overrides as Record<string, unknown>;
    return (
      Object.hasOwn(overrides, scope) ||
      getMarkers(target.explicitDefaultPaths, domain).includes(scope)
    );
  };

  const missing = LEGACY_SCOPES.filter((scope) => !isSatisfied(scope));
  const legacyDomains = missing.filter((scope) => !legacyByDomain.has(scope));
  const { sources, present } = await readLegacyScopeSources({ domains: legacyDomains, session });
  const pending = new Map<
    TargetScope,
    { overrides: Record<string, unknown>; explicitDefaultPaths: string[] }
  >();

  for (const scope of missing) {
    const oldInstance = legacyByDomain.get(scope);
    if (!oldInstance && !present.has(scope)) continue;
    const rawSource = oldInstance ? oldInstance.overrides : sources[scope];
    const source =
      scope === 'modelStatusProbe' ? decryptDomainSecrets(scope, rawSource) : rawSource;
    const normalized = MERGED_SCOPES.some((item) => item === scope)
      ? validateSchema({
          name: scope,
          schema: mergedScopeSchemas[scope as MergedScope],
          value: source
        })
      : validateSchema({
          name: scope,
          schema: systemInstanceConfigScopeSchemaMap[scope as (typeof STANDALONE_SCOPES)[number]],
          value: source
        });
    const value = scope === 'subPlans' ? mergeNormalizedPlans(source, normalized) : source;
    const domain = getTargetDomain(scope);
    const existing = targetByDomain.get(domain);
    const previous = pending.get(domain);
    const overrides = previous?.overrides ?? { ...(existing?.overrides ?? {}) };
    const explicitDefaultPaths =
      previous?.explicitDefaultPaths ?? getMarkers(existing?.explicitDefaultPaths, domain);

    if (MERGED_SCOPES.some((item) => item === scope)) {
      const oldMarkers = oldInstance
        ? getMarkers(oldInstance.explicitDefaultPaths, scope).map((path) => `${scope}.${path}`)
        : [];
      const markers = Array.from(new Set([...explicitDefaultPaths, ...oldMarkers]));
      const retained = withoutExplicitDefaults({ value, path: scope, markers });
      // 已选中的旧源即使被标记完全过滤，也要记下空对象，防止后续重新选取更旧快照。
      if (!markers.includes(scope)) overrides[scope] = retained ?? {};
      pending.set(domain, { overrides, explicitDefaultPaths: markers });
    } else {
      pending.set(domain, { overrides: value as Record<string, unknown>, explicitDefaultPaths });
    }
  }

  // 不执行任何写入之前校验所有候选与合并结果，确保一次失败不会留下半套配置。
  for (const [domain, update] of pending) validateTarget(domain, update.overrides);
  return { targets: targetByDomain, storedOverridesByDomain, legacyInstances, pending };
};

/**
 * 把旧套餐、公告和辅助配置迁入当前 scope；已有目标及显式默认意图始终优先。
 * 数据量固定且很小，在同一事务中完整读取、校验、补缺、验证并清理开发期旧 scope；
 * 失败回滚，CAS 与事务冲突重试防止并发管理员修改被覆盖，重跑不再更新 revision。
 * 独立调用先创建 domain 唯一索引；传入事务时索引必须由调用方在事务前创建。
 */
export const migrateLegacyConfigScopes = async (session?: ClientSession) => {
  const migrate = async (session: ClientSession) => {
    const { targets, storedOverridesByDomain, legacyInstances, pending } =
      await prepareScopeMigration(session);

    for (const [domain, { overrides, explicitDefaultPaths }] of pending) {
      const target = targets.get(domain);
      const now = new Date();
      if (target) {
        const result = await MongoSystemInstanceConfig.updateOne(
          { _id: target._id, domain, revision: target.revision },
          {
            $set: {
              overrides:
                domain === 'commercial' || domain === 'modelStatusProbe'
                  ? encryptDomainSecrets({
                      domain,
                      data: overrides,
                      previousStored: storedOverridesByDomain.get(domain)
                    })
                  : overrides,
              explicitDefaultPaths,
              updatedBy: { actor: 'migration' },
              updatedAt: now
            },
            $inc: { revision: 1 }
          },
          { session, timestamps: false, runValidators: false }
        );
        if (result.matchedCount !== 1) throw new MongoTransactionConflictError(domain);
      } else {
        try {
          const result = await MongoSystemInstanceConfig.updateOne(
            { domain },
            {
              $setOnInsert: {
                domain,
                overrides:
                  domain === 'commercial' || domain === 'modelStatusProbe'
                    ? encryptDomainSecrets({ domain, data: overrides })
                    : overrides,
                revision: 1,
                schemaVersion: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
                explicitDefaultPaths,
                updatedBy: { actor: 'migration' },
                createdAt: now,
                updatedAt: now
              }
            },
            {
              upsert: true,
              session,
              timestamps: false,
              runValidators: true,
              setDefaultsOnInsert: false
            }
          );
          if (result.upsertedCount !== 1) throw new MongoTransactionConflictError(domain);
        } catch (error) {
          if ((error as { code?: number }).code === 11000) {
            throw new MongoTransactionConflictError(domain);
          }
          throw error;
        }
      }
    }

    // 旧文档仅在对应配置已被承接或被更高优先级目标覆盖后删除；原始 systemconfigs 永远保留。
    for (const legacy of legacyInstances) {
      const deleted = await MongoSystemInstanceConfig.collection.deleteOne(
        { _id: legacy._id, domain: legacy.domain, revision: legacy.revision },
        { session }
      );
      if (deleted.deletedCount !== 1) throw new MongoTransactionConflictError(legacy.domain);
    }
    const remaining = await prepareScopeMigration(session);
    if (remaining.pending.size > 0 || remaining.legacyInstances.length > 0) {
      throw new Error('Configuration scope migration incomplete after write');
    }
  };
  if (session) return migrate(session);
  await MongoSystemInstanceConfig.createIndexes();
  return mongoSessionRun(migrate);
};

/** 验证目标 Schema、旧源承接与开发期 scope 清理，不以自动填充的默认值冒充迁移完成。 */
export const verifyLegacyConfigScopes = async () => {
  const indexes = await MongoSystemInstanceConfig.collection.indexes();
  const hasUniqueDomainIndex = indexes.some(
    (index) =>
      index.unique === true &&
      Object.keys(index.key).length === 1 &&
      index.key.domain === 1 &&
      !index.partialFilterExpression &&
      !index.sparse
  );
  if (!hasUniqueDomainIndex) throw new Error('Configuration scope unique domain index missing');
  const { pending, legacyInstances } = await prepareScopeMigration();
  if (legacyInstances.length > 0 || pending.size > 0) {
    const domain = legacyInstances[0]?.domain ?? pending.keys().next().value;
    throw new Error(`Configuration scope migration incomplete: ${domain}`);
  }
};
