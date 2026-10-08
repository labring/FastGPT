import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  type SystemInstanceConfigDomainKey,
  resolveDomainEffectiveConfig
} from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import type { SystemMigrationLogger } from '@/migration/registry';

/**
 * 已从 Schema 移除、但仍可能存在于存量 overrides 中的字段路径。
 *
 * 这些字段在 Admin 评审后被判定为「改由环境变量提供」或「不再需要」，
 * 字段定义已从各 Domain Schema 中删除。由于 Override Schema 使用 strictObject，
 * 残留 key 会导致该 Domain 的读取与保存直接抛错，因此必须在启动阶段清理。
 */
export const deprecatedOverridePaths: Partial<
  Record<SystemInstanceConfigDomainKey, readonly (readonly string[])[]>
> = {
  site: [['chineseRedirectUrl'], ['systemTitle']],
  performance: [
    ['chat', 'logUrl'],
    ['chat', 'logInterval'],
    ['chat', 'logSourceIdPrefix']
  ],
  storage: [['downloadRedirectTtlSeconds'], ['downloadRedirectEndpoint']],
  feature: [['showWorkorder'], ['showEnterpriseAuth']],
  vector: [['vqLevel'], ['languageIdentifier']],
  providers: [['chunk'], ['crm']],
  auth: [
    ['loginProviders', 'sms', 'login', 'en'],
    ['loginProviders', 'sms', 'register', 'en'],
    ['loginProviders', 'sms', 'resetPassword', 'en'],
    ['loginProviders', 'sms', 'changePassword', 'en'],
    ['loginProviders', 'sms', 'bindNotification', 'en'],
    ['accountCancellation', 'cancellationSm', 'en'],
    ['accountCancellation', 'reminderSm', 'en'],
    ['accountCancellation', 'todaySm', 'en']
  ],
  commercial: [
    ['billingNotify', 'paymentReceived', 'en'],
    ['billingNotify', 'lackOfPoints', 'en'],
    ['billingNotify', 'pointsTenPercentRemain', 'en'],
    ['billingNotify', 'expireSoon', 'en'],
    ['billingNotify', 'expired', 'en']
  ]
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 按路径删除嵌套字段；删除后若父对象变空则一并移除，避免留下空覆盖块。
 * 返回是否发生了删除。
 */
const removeDeepPath = (target: Record<string, unknown>, path: readonly string[]): boolean => {
  const [head, ...rest] = path;
  if (!(head in target)) return false;

  if (rest.length === 0) {
    delete target[head];
    return true;
  }

  const child = target[head];
  if (!isPlainObject(child)) return false;

  const removed = removeDeepPath(child, rest);
  if (removed && Object.keys(child).length === 0) {
    delete target[head];
  }
  return removed;
};

/** 判断 overrides 中是否仍存在任一废弃字段。 */
export const hasDeprecatedOverrides = (
  domain: SystemInstanceConfigDomainKey,
  overrides: unknown
): boolean => {
  const paths = deprecatedOverridePaths[domain];
  if (!paths || !isPlainObject(overrides)) return false;

  return paths.some((path) => {
    let cursor: unknown = overrides;
    for (const segment of path) {
      if (!isPlainObject(cursor) || !(segment in cursor)) return false;
      cursor = cursor[segment];
    }
    return true;
  });
};

/**
 * 返回剔除废弃字段后的 overrides 副本。
 * 不修改入参，便于调用方在写入前先完成校验。
 */
export const stripDeprecatedOverrides = (
  domain: SystemInstanceConfigDomainKey,
  overrides: unknown
): { overrides: Record<string, unknown>; removedFieldCount: number } => {
  const paths = deprecatedOverridePaths[domain];
  if (!paths || !isPlainObject(overrides)) {
    return { overrides: isPlainObject(overrides) ? overrides : {}, removedFieldCount: 0 };
  }

  const clone = structuredClone(overrides);
  let removedFieldCount = 0;
  for (const path of paths) {
    if (removeDeepPath(clone, path)) removedFieldCount += 1;
  }

  return { overrides: clone, removedFieldCount };
};

/**
 * 清理存量 system_instance_configs 中的废弃 overrides 字段。
 *
 * 全量重跑策略：本集合每个 Domain 至多一条文档（共 11 条），数据量与耗时都有明确上界，
 * 因此不保存伪 checkpoint，每次执行都重新读取全部文档并确定性覆盖，重复执行安全幂等。
 * 仅当确实删除了字段时才写回并递增 revision，避免无意义地打断管理员的乐观锁。
 */
export const cleanupInstanceConfigDeprecatedFields = async ({
  logger
}: {
  logger: SystemMigrationLogger;
}) => {
  const docs = await MongoSystemInstanceConfig.find({}).lean();

  const updatedDomains: SystemInstanceConfigDomainKey[] = [];
  let removedFieldCount = 0;

  for (const doc of docs) {
    const domain = doc._id as SystemInstanceConfigDomainKey;
    if (!SYSTEM_INSTANCE_CONFIG_DOMAINS.includes(domain)) continue;

    const { overrides, removedFieldCount: removed } = stripDeprecatedOverrides(
      domain,
      doc.overrides
    );
    if (removed === 0) continue;

    // 写回前先按新 Schema 终审，确保清理结果可被运行时解析。
    resolveDomainEffectiveConfig(domain, overrides);

    const updated = await MongoSystemInstanceConfig.findOneAndUpdate(
      { _id: domain, revision: doc.revision },
      { $set: { overrides, updatedAt: new Date() }, $inc: { revision: 1 } },
      { new: true, runValidators: true }
    ).lean();

    // revision 被并发修改时跳过本轮；下次重跑会再次扫描到该文档。
    if (!updated) {
      logger.warn('Instance config cleanup skipped due to concurrent revision change', {
        domain,
        revision: doc.revision
      });
      continue;
    }

    updatedDomains.push(domain);
    removedFieldCount += removed;
  }

  logger.info('Instance config deprecated fields cleaned', {
    scannedDocuments: docs.length,
    updatedDomains,
    removedFieldCount
  });

  return { scannedDocuments: docs.length, updatedDomains, removedFieldCount };
};

/**
 * 完成校验：确认不存在残留废弃字段，且每个 Domain 都能按新 Schema 解析出生效配置。
 */
export const verifyInstanceConfigDeprecatedFields = async () => {
  const docs = await MongoSystemInstanceConfig.find({}).lean();

  const remainingDocuments: SystemInstanceConfigDomainKey[] = [];
  const invalidDomains: SystemInstanceConfigDomainKey[] = [];

  for (const doc of docs) {
    const domain = doc._id as SystemInstanceConfigDomainKey;
    if (!SYSTEM_INSTANCE_CONFIG_DOMAINS.includes(domain)) continue;

    if (hasDeprecatedOverrides(domain, doc.overrides)) {
      remainingDocuments.push(domain);
      continue;
    }

    try {
      resolveDomainEffectiveConfig(domain, doc.overrides);
    } catch {
      invalidDomains.push(domain);
    }
  }

  return {
    scannedDocuments: docs.length,
    remainingDocuments,
    invalidDomains
  };
};
