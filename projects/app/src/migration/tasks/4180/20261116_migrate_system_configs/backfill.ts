import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { hasOverridePath } from '@fastgpt/global/common/system/config/merge';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { StorageConfigSchema } from '@fastgpt/global/common/system/config/schemas/storage';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

/** 使用原生集合兼容早期字符串 _id 域文档，避免 Mongoose 将 security 强制转换为 ObjectId。 */
const readSecurityConfig = () =>
  MongoSystemInstanceConfig.collection.findOne(
    {
      $or: [{ domain: 'security' }, { $expr: { $eq: ['$_id', 'security'] } }]
    },
    { readPreference: 'primary' }
  );

/** 检查显式默认值标记，避免把损坏的元数据误判为用户已关闭开关。 */
const hasExplicitFileCheckDefault = (paths: unknown): boolean => {
  if (paths === null || paths === undefined) return false;
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
    throw new Error('Invalid security instance config explicitDefaultPaths');
  }
  return paths.includes('checkExternalFile');
};

/**
 * 补齐外部文件检查开关，按 revision 重试且只写缺失字段。
 * 旧非空名单原本就在生效，升级后应继续开启；空名单保持关闭。
 * 显式保存为默认 false 的字段可能已被剪枝，必须同时尊重 explicitDefaultPaths。
 */
export const backfillExternalFileCheck = async ({
  assertActive
}: {
  assertActive: () => Promise<void>;
}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await readSecurityConfig();
    if (!doc) throw new Error('Security instance config is missing');

    const overrides = doc.overrides ?? {};
    const security = resolveDomainEffectiveConfig({ domain: 'security', overrides });
    if (
      Object.hasOwn(overrides, 'checkExternalFile') ||
      hasExplicitFileCheckDefault(doc.explicitDefaultPaths)
    ) {
      return { updatedDocuments: 0 };
    }

    await assertActive();
    const result = await MongoSystemInstanceConfig.collection.updateOne(
      { _id: doc._id, revision: doc.revision },
      {
        $set: {
          // Mongo 无法给 null 的父字段写入子字段；缺失或已有对象仍按路径增量更新。
          ...(doc.overrides === null
            ? { overrides: { checkExternalFile: security.fileUrlWhitelist.length > 0 } }
            : { 'overrides.checkExternalFile': security.fileUrlWhitelist.length > 0 }),
          updatedBy: { actor: 'migration' },
          updatedAt: new Date()
        },
        $inc: { revision: 1 }
      }
    );
    if (result.modifiedCount === 1) return { updatedDocuments: 1 };
    // 配置可能由另一个节点更新；重新读取名单和显式默认标记，不能基于旧值覆盖。
  }

  throw new Error('External file check backfill repeatedly conflicted with config updates');
};

/** 校验回填完成，既接受持久化的布尔值，也接受管理员明确保存的默认 false。 */
export const verifyExternalFileCheck = async () => {
  const doc = await readSecurityConfig();
  if (!doc) throw new Error('Security instance config is missing');
  const overrides = doc.overrides ?? {};
  resolveDomainEffectiveConfig({ domain: 'security', overrides });
  if (
    !Object.hasOwn(overrides, 'checkExternalFile') &&
    !hasExplicitFileCheckDefault(doc.explicitDefaultPaths)
  ) {
    throw new Error('External file check backfill is incomplete');
  }
};

const templatePath = 'loginProviders.sms.modelDeprecation.zh';

/** 校验显式清空标记，避免损坏元数据导致旧模板覆盖管理员意图。 */
const hasExplicitSmsDefault = (paths: unknown): boolean => {
  if (paths === null || paths === undefined) return false;
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
    throw new Error('Invalid auth instance config explicitDefaultPaths');
  }
  return paths.includes(templatePath);
};

/** 获取旧中文模板；仅当中文缺失时沿用旧迁移的英文回退规则。 */
const readLegacyTemplate = async (): Promise<string | undefined> => {
  const legacy = await MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgptPro })
    .sort({ type: 1, _id: -1 })
    .lean();
  const sms = legacy?.value?.auth?.sms;
  for (const value of [sms?.MODEL_DEPRECATION, sms?.MODEL_DEPRECATION_EN]) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
};

/**
 * 从旧 Pro 配置一次性补齐模型下架通知模板。
 * 仅目标叶子缺失时写入；保留管理员设置、显式清空和其他 auth 字段。
 */
export const backfillModelDeprecationSms = async ({
  assertActive
}: {
  assertActive: () => Promise<void>;
}) => {
  const legacyTemplate = await readLegacyTemplate();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await MongoSystemInstanceConfig.collection.findOne(
      {
        $or: [{ domain: 'auth' }, { $expr: { $eq: ['$_id', 'auth'] } }]
      },
      { readPreference: 'primary' }
    );
    if (!doc) throw new Error('Auth instance config is missing');

    const overrides = doc.overrides ?? {};
    resolveDomainEffectiveConfig({ domain: 'auth', overrides });
    if (
      hasOverridePath(overrides, templatePath) ||
      hasExplicitSmsDefault(doc.explicitDefaultPaths)
    ) {
      return { updatedDocuments: 0 };
    }
    if (legacyTemplate === undefined) return { updatedDocuments: 0 };

    const target = {
      ...overrides,
      loginProviders: {
        ...overrides.loginProviders,
        sms: {
          ...overrides.loginProviders?.sms,
          modelDeprecation: {
            ...overrides.loginProviders?.sms?.modelDeprecation,
            zh: legacyTemplate
          }
        }
      }
    };
    // 迁移失败信息不包含短信模板原值。
    try {
      resolveDomainEffectiveConfig({ domain: 'auth', overrides: target });
    } catch {
      throw new Error('Invalid legacy model deprecation SMS template');
    }
    await assertActive();
    const result = await MongoSystemInstanceConfig.collection.updateOne(
      { _id: doc._id, revision: doc.revision },
      {
        $set: { overrides: target, updatedAt: new Date(), updatedBy: { actor: 'migration' } },
        $inc: { revision: 1 }
      }
    );
    if (result.modifiedCount === 1) return { updatedDocuments: 1 };
  }
  throw new Error('Model deprecation SMS backfill repeatedly conflicted with config updates');
};

/** 有旧模板时必须存在持久值或管理员显式清空标记；无旧模板时无需写入。 */
export const verifyModelDeprecationSms = async () => {
  const [legacyTemplate, doc] = await Promise.all([
    readLegacyTemplate(),
    MongoSystemInstanceConfig.collection.findOne(
      {
        $or: [{ domain: 'auth' }, { $expr: { $eq: ['$_id', 'auth'] } }]
      },
      { readPreference: 'primary' }
    )
  ]);
  if (!doc) throw new Error('Auth instance config is missing');
  const overrides = doc.overrides ?? {};
  resolveDomainEffectiveConfig({ domain: 'auth', overrides });
  const present =
    hasOverridePath(overrides, templatePath) || hasExplicitSmsDefault(doc.explicitDefaultPaths);
  if (legacyTemplate !== undefined && !present) {
    throw new Error('Model deprecation SMS backfill is incomplete');
  }
};

/** 单文档全量幂等回填；已有值和显式清空优先，CAS 冲突时重读管理员最新配置。 */
export const rehomeFileDomain = async ({
  assertActive,
  legacyEnv = process.env
}: {
  assertActive: () => Promise<void>;
  legacyEnv?: Record<string, string | undefined>;
}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await MongoSystemInstanceConfig.collection.findOne(
      { domain: 'storage' },
      { readPreference: 'primary' }
    );
    if (!doc) throw new Error('Storage instance config is missing');
    const overrides = doc.overrides ?? {};
    const paths = doc.explicitDefaultPaths ?? [];
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
      throw new Error('Invalid storage explicit-default metadata');
    }
    try {
      resolveDomainEffectiveConfig({ domain: 'storage', overrides });
    } catch {
      throw new Error('Invalid existing storage configuration');
    }
    if (Object.hasOwn(overrides, 'fileDomain')) return { updatedDocuments: 0 };

    let fileDomain: string;
    try {
      fileDomain = StorageConfigSchema.shape.fileDomain.parse(
        paths.includes('fileDomain') ? '' : (legacyEnv.FILE_DOMAIN ?? '')
      );
    } catch {
      throw new Error('Invalid legacy file service domain');
    }

    await assertActive();
    const result = await MongoSystemInstanceConfig.collection.updateOne(
      { _id: doc._id, revision: doc.revision },
      {
        $set: {
          'overrides.fileDomain': fileDomain,
          updatedAt: new Date(),
          updatedBy: { actor: 'migration' }
        },
        $inc: { revision: 1 }
      }
    );
    if (result.modifiedCount === 1) return { updatedDocuments: 1 };
  }
  throw new Error('File service domain migration repeatedly conflicted with config updates');
};

/** 要求地址真实落库或有显式默认标记，不能仅凭 Schema 默认值判定回填完成。 */
export const verifyFileDomainMigration = async () => {
  const doc = await MongoSystemInstanceConfig.collection.findOne(
    { domain: 'storage' },
    { readPreference: 'primary' }
  );
  if (!doc) throw new Error('Storage instance config is missing');
  try {
    resolveDomainEffectiveConfig({ domain: 'storage', overrides: doc.overrides });
  } catch {
    throw new Error('Invalid storage configuration after file domain migration');
  }
  if (
    !Object.hasOwn(doc.overrides ?? {}, 'fileDomain') &&
    !doc.explicitDefaultPaths?.includes('fileDomain')
  ) {
    throw new Error('File service domain migration is incomplete');
  }
};

const policies = [
  { domain: 'security', field: 'authCookieSecure', env: 'AUTH_COOKIE_SECURE' },
  {
    domain: 'resource',
    field: 'serviceAxiosMaxContentLength',
    env: 'SERVICE_AXIOS_MAX_CONTENT_LENGTH'
  }
] as const;

/** 读取并校验两个目标域；默认值标记与已有字段同样代表管理员的持久化意图。 */
const readPolicyDocuments = async () => {
  const docs = await MongoSystemInstanceConfig.collection
    .find(
      { domain: { $in: policies.map((policy) => policy.domain) } },
      { readPreference: 'primary' }
    )
    .toArray();

  return policies.map((policy) => {
    const doc = docs.find((item) => item.domain === policy.domain);
    if (!doc) throw new Error(`Missing HTTP policy configuration domain: ${policy.domain}`);
    const overrides = doc.overrides ?? {};
    const paths: unknown = doc.explicitDefaultPaths ?? [];
    if (!Array.isArray(paths) || !paths.every((item) => typeof item === 'string')) {
      throw new Error(`Invalid HTTP policy explicit-default metadata: ${policy.domain}`);
    }
    try {
      resolveDomainEffectiveConfig({ domain: policy.domain, overrides });
    } catch {
      throw new Error(`Invalid existing HTTP policy configuration: ${policy.domain}`);
    }
    return { policy, doc, overrides, explicitPaths: new Set<string>(paths) };
  });
};

/**
 * 启动前一次性导入 Cookie 与共享 HTTP 响应上限，采用幂等全量重跑。
 * 两域先完成输入校验，再通过同一事务和 revision CAS 发布；已有字段或显式默认值优先。
 * 无旧 ENV 时也持久化默认值，确保重跑不会重新接受之后改动的 ENV。
 */
export const rehomeHttpRuntimePolicies = async ({
  assertActive,
  legacyEnv = process.env
}: {
  assertActive: () => Promise<void>;
  legacyEnv?: Record<string, string | undefined>;
}) => {
  class PolicyRevisionConflict extends Error {}

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const documents = await readPolicyDocuments();
    const plans = documents
      .filter(
        ({ policy, overrides, explicitPaths }) =>
          !Object.hasOwn(overrides, policy.field) && !explicitPaths.has(policy.field)
      )
      .map(({ policy, doc, overrides }) => {
        const raw = legacyEnv[policy.env];
        // 保持旧 ENV 的布尔及非负整数语义，0 仍代表仅允许空响应，不解释为不限量。
        const parsed =
          policy.domain === 'security'
            ? BoolSchema.safeParse(raw?.trim() ? raw : false)
            : IntSchema.safeParse(raw?.trim() ? raw : 20);
        if (!parsed.success) {
          throw new Error(`Invalid HTTP policy migration input: ${policy.env}`);
        }
        const target = { ...overrides, [policy.field]: parsed.data };
        try {
          resolveDomainEffectiveConfig({ domain: policy.domain, overrides: target });
        } catch {
          throw new Error(`Invalid HTTP policy migration target: ${policy.domain}`);
        }
        return { doc, target };
      });
    if (plans.length === 0) return { updatedDocuments: 0 };

    await assertActive();
    try {
      await mongoSessionRun(async (session) => {
        // driver 重试事务回调时也检查 lease，避免旧 runId 再发起写入。
        await assertActive();
        for (const { doc, target } of plans) {
          const result = await MongoSystemInstanceConfig.collection.updateOne(
            { _id: doc._id, revision: doc.revision },
            {
              $set: {
                overrides: target,
                updatedAt: new Date(),
                updatedBy: { actor: 'migration' }
              },
              $inc: { revision: 1 }
            },
            { session }
          );
          if (result.modifiedCount !== 1) throw new PolicyRevisionConflict();
        }
      });
      return { updatedDocuments: plans.length };
    } catch (error) {
      if (!(error instanceof PolicyRevisionConflict)) throw error;
      // 与管理员保存冲突时重读两个域，只为仍缺失的字段导入旧值。
    }
  }
  throw new Error('HTTP policy migration repeatedly conflicted with configuration updates');
};

/** 完成条件要求两个字段均有持久化依据，不能以 Schema 默认值证明已迁移。 */
export const verifyHttpRuntimePolicyMigration = async () => {
  for (const { policy, overrides, explicitPaths } of await readPolicyDocuments()) {
    if (!Object.hasOwn(overrides, policy.field) && !explicitPaths.has(policy.field)) {
      throw new Error(`HTTP policy migration is incomplete: ${policy.domain}.${policy.field}`);
    }
  }
};

const groups = ['kc', 'issuerServiceName', 'nginxServiceName'] as const;
const providers = ['aliyun', 'tencent', 'volcengine'] as const;

/**
 * 单文档幂等回填旧表单部署配置，只补缺失字段，不覆盖管理员值或显式清空。
 * 空值记录为显式默认路径，非空值保持稀疏存储；CAS 冲突后重读，不记录凭据。
 */
export const restoreCustomDomainConfig = async ({
  assertActive
}: {
  assertActive: () => Promise<void>;
}) => {
  const legacy = await MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgpt })
    .sort({ type: 1, _id: -1 })
    .read('primary')
    .lean();
  const source = legacy?.value?.systemEnv?.customDomain ?? {};

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await MongoSystemInstanceConfig.collection.findOne(
      { domain: 'site' },
      { readPreference: 'primary' }
    );
    if (!doc) throw new Error('Site instance config is missing');
    const overrides = doc.overrides ?? {};
    const paths = doc.explicitDefaultPaths ?? [];
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
      throw new Error('Invalid site explicit-default metadata');
    }
    try {
      resolveDomainEffectiveConfig({ domain: 'site', overrides });
    } catch {
      throw new Error('Invalid existing site configuration');
    }

    const merged = structuredClone(overrides);
    const explicit = new Set<string>(paths);
    let updatedFields = 0;
    for (const group of groups) {
      for (const provider of providers) {
        const field = `customDomain.${group}.${provider}`;
        if (hasOverridePath(overrides, field) || explicit.has(field)) continue;
        const value = source[group]?.[provider] ?? '';
        if (typeof value !== 'string') {
          throw new Error(`Invalid legacy custom domain field: ${group}.${provider}`);
        }
        if (value === '') {
          explicit.add(field);
        } else {
          merged.customDomain ??= {};
          merged.customDomain[group] ??= {};
          merged.customDomain[group][provider] = value;
        }
        updatedFields += 1;
      }
    }
    if (updatedFields === 0) return { updatedFields: 0 };

    try {
      resolveDomainEffectiveConfig({ domain: 'site', overrides: merged });
    } catch {
      throw new Error('Invalid restored custom domain configuration');
    }
    await assertActive();
    const result = await MongoSystemInstanceConfig.collection.updateOne(
      { _id: doc._id, revision: doc.revision },
      {
        $set: {
          overrides: merged,
          explicitDefaultPaths: [...explicit],
          updatedAt: new Date(),
          updatedBy: { actor: 'migration' }
        },
        $inc: { revision: 1 }
      }
    );
    if (result.modifiedCount === 1) return { updatedFields };
  }
  throw new Error('Custom domain configuration repeatedly conflicted with config updates');
};

/** 九个字段均须有值或显式默认标记，不能只按 Schema 自动补出的空字符串验收。 */
export const verifyCustomDomainConfig = async () => {
  const doc = await MongoSystemInstanceConfig.collection.findOne(
    { domain: 'site' },
    { readPreference: 'primary' }
  );
  if (!doc) throw new Error('Site instance config is missing');
  const paths = doc.explicitDefaultPaths ?? [];
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
    throw new Error('Invalid site explicit-default metadata');
  }
  try {
    resolveDomainEffectiveConfig({ domain: 'site', overrides: doc.overrides });
  } catch {
    throw new Error('Invalid restored site configuration');
  }
  for (const group of groups) {
    for (const provider of providers) {
      const field = `customDomain.${group}.${provider}`;
      if (!hasOverridePath(doc.overrides, field) && !paths.includes(field)) {
        throw new Error(`Custom domain configuration is incomplete: ${field}`);
      }
    }
  }
};
