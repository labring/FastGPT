import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION } from '@fastgpt/global/common/system/config/schema';
import { systemInstanceConfigScopeSchemaMap } from '@fastgpt/global/common/system/config/scopes';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import type { ClientSession } from '@fastgpt/service/common/mongo';

const LEGACY_INSTANCE_ID = '000000000000000000000001';
const MIGRATED_SCOPES = [
  SystemConfigsTypeEnum.subPlans,
  SystemConfigsTypeEnum.langfuse,
  SystemConfigsTypeEnum.license,
  SystemConfigsTypeEnum.instanceId,
  SystemConfigsTypeEnum.modelStatusProbe,
  SystemConfigsTypeEnum.moderationPolicy,
  SystemConfigsTypeEnum.systemMsgModal,
  SystemConfigsTypeEnum.operationalAd,
  SystemConfigsTypeEnum.activityAd
] as const;
type MigratedScope = (typeof MIGRATED_SCOPES)[number];

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
const validateScope = (domain: keyof typeof systemInstanceConfigScopeSchemaMap, value: unknown) => {
  const result = systemInstanceConfigScopeSchemaMap[domain].safeParse(value);
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path.join('.') || '<root>');
    throw new Error(`Invalid configuration scope ${domain} fields: ${paths.join(', ')}`);
  }
  return result.data;
};

/**
 * 按旧写入语义选权威记录：实例 ID 的固定主键优先，其余按时间和主键稳定排序。
 * 缺失独立套餐、追踪配置时才回退到最后一条 fastgpt 快照。
 */
const readLegacyScopeSources = async ({
  domains,
  session
}: {
  domains: readonly MigratedScope[];
  session?: ClientSession;
}) => {
  const sources: Partial<Record<MigratedScope, unknown>> = {};
  const present = new Set<MigratedScope>();
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
  const needsLangfuse =
    domains.includes(SystemConfigsTypeEnum.langfuse) &&
    !present.has(SystemConfigsTypeEnum.langfuse);
  if (needsPlans || needsLangfuse) {
    const legacy = await MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgpt })
      .sort({ type: 1, _id: -1 })
      .session(session ?? null)
      .lean();
    if (needsPlans && legacy?.value?.subPlans !== undefined) {
      sources.subPlans = legacy.value.subPlans;
      present.add(SystemConfigsTypeEnum.subPlans);
    }
    if (needsLangfuse && legacy?.value?.systemEnv?.langfuse !== undefined) {
      sources.langfuse = legacy.value.systemEnv.langfuse;
      present.add(SystemConfigsTypeEnum.langfuse);
    }
  }
  return { sources, present };
};

/**
 * 把九个历史配置迁入实例配置单例；已有目标优先，Pro ENV 始终由 Pro 独立发布。
 * 在同一事务快照中先校验全部待导入数据，再用 $setOnInsert 写入，保证失败回滚和重跑幂等。
 * 独立调用先创建 domain 唯一索引；传入事务时索引必须由调用方在事务前创建。
 */
export const migrateLegacyConfigScopes = async (session?: ClientSession) => {
  const migrate = async (session: ClientSession) => {
    const targets = await MongoSystemInstanceConfig.find({ domain: { $in: MIGRATED_SCOPES } })
      .session(session)
      .lean();
    for (const target of targets) {
      validateScope(target.domain as MigratedScope, target.overrides);
    }
    const missing = MIGRATED_SCOPES.filter(
      (domain) => !targets.some((doc) => doc.domain === domain)
    );
    const { sources, present } = await readLegacyScopeSources({ domains: missing, session });
    const pending = missing.flatMap((domain) => {
      if (!present.has(domain)) return [];
      const source = sources[domain];
      const normalized = validateScope(domain, source);
      // 原始授权数据和实例 ID 必须无损；仅套餐须按现有输入契约归一化数值。
      const overrides = domain === 'subPlans' ? mergeNormalizedPlans(source, normalized) : source;
      return [{ domain, overrides }];
    });

    for (const { domain, overrides } of pending) {
      const now = new Date();
      await MongoSystemInstanceConfig.updateOne(
        { domain },
        {
          $setOnInsert: {
            domain,
            overrides,
            revision: 1,
            schemaVersion: SYSTEM_INSTANCE_CONFIG_SCHEMA_VERSION,
            explicitDefaultPaths: [],
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
    }
  };
  if (session) return migrate(session);
  await MongoSystemInstanceConfig.createIndexes();
  return mongoSessionRun(migrate);
};

/** 验证全部已发布辅助 scope 的 Schema，并确认每个有旧源的 scope 已持久化。 */
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
  const targets = await MongoSystemInstanceConfig.find({
    domain: { $in: [...MIGRATED_SCOPES, 'proEnv'] }
  }).lean();
  for (const target of targets) {
    validateScope(
      target.domain as keyof typeof systemInstanceConfigScopeSchemaMap,
      target.overrides
    );
  }
  const missing = MIGRATED_SCOPES.filter((domain) => !targets.some((doc) => doc.domain === domain));
  const { present } = await readLegacyScopeSources({ domains: missing });
  for (const domain of missing) {
    if (present.has(domain)) throw new Error(`Configuration scope migration incomplete: ${domain}`);
  }
};
