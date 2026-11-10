import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';

/** 使用原生集合兼容早期字符串 _id 域文档，避免 Mongoose 将 security 强制转换为 ObjectId。 */
const readSecurityConfig = () =>
  MongoSystemInstanceConfig.collection.findOne({
    $or: [{ domain: 'security' }, { $expr: { $eq: ['$_id', 'security'] } }]
  });

/** 检查显式默认值标记，避免把损坏的元数据误判为用户已关闭开关。 */
const hasExplicitDefault = (paths: unknown): boolean => {
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
      hasExplicitDefault(doc.explicitDefaultPaths)
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
    !hasExplicitDefault(doc.explicitDefaultPaths)
  ) {
    throw new Error('External file check backfill is incomplete');
  }
};
