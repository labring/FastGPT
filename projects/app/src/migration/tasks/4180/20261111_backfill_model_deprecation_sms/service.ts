import { hasOverridePath } from '@fastgpt/global/common/system/config/merge';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';

const templatePath = 'loginProviders.sms.modelDeprecation.zh';

/** 校验显式清空标记，避免损坏元数据导致旧模板覆盖管理员意图。 */
const hasExplicitDefault = (paths: unknown): boolean => {
  if (paths === null || paths === undefined) return false;
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
    throw new Error('Invalid auth instance config explicitDefaultPaths');
  }
  return paths.includes(templatePath);
};

/** 获取旧中文模板；仅当中文缺失时沿用旧迁移的英文回退规则。 */
const readLegacyTemplate = async (): Promise<string | undefined> => {
  const legacy = await MongoSystemConfigs.findOne({ type: SystemConfigsTypeEnum.fastgptPro })
    .sort({ createTime: -1 })
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
    const doc = await MongoSystemInstanceConfig.collection.findOne({
      $or: [{ domain: 'auth' }, { $expr: { $eq: ['$_id', 'auth'] } }]
    });
    if (!doc) throw new Error('Auth instance config is missing');

    const overrides = doc.overrides ?? {};
    resolveDomainEffectiveConfig({ domain: 'auth', overrides });
    if (hasOverridePath(overrides, templatePath) || hasExplicitDefault(doc.explicitDefaultPaths)) {
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
    MongoSystemInstanceConfig.collection.findOne({
      $or: [{ domain: 'auth' }, { $expr: { $eq: ['$_id', 'auth'] } }]
    })
  ]);
  if (!doc) throw new Error('Auth instance config is missing');
  const overrides = doc.overrides ?? {};
  resolveDomainEffectiveConfig({ domain: 'auth', overrides });
  const present =
    hasOverridePath(overrides, templatePath) || hasExplicitDefault(doc.explicitDefaultPaths);
  if (legacyTemplate !== undefined && !present) {
    throw new Error('Model deprecation SMS backfill is incomplete');
  }
};
