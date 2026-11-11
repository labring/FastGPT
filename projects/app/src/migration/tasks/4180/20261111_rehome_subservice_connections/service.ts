import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { isDeepStrictEqual } from 'node:util';
import z from 'zod';
import { isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';
import { stripDeprecatedOverrides } from '../20260929_cleanup_instance_config_deprecated_fields/service';

const LegacyConnectionEnvSchema = z.object({
  CODE_SANDBOX_URL: z
    .string()
    .refine((value) => value === '' || isValidServiceBaseUrl(value))
    .optional(),
  CODE_SANDBOX_TOKEN: z.string().optional()
});

/**
 * 将代码沙箱连接一次性搬入实例配置，补齐 MCP SSE 开关。
 * 一条域文档采用全量幂等 CAS：已有值和显式默认标记优先，填空值也持久化，避免重跑复活 ENV。
 * 历史 ENV 仅在缺少对应目标叶子时校验；异常不包含源值，且写入前完成整个域校验。
 */
export const rehomeSubserviceConnections = async ({
  assertActive,
  legacyEnv = process.env
}: {
  assertActive: () => Promise<void>;
  legacyEnv?: Record<string, string | undefined>;
}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await MongoSystemInstanceConfig.collection.findOne({
      $or: [{ domain: 'subservice' }, { $expr: { $eq: ['$_id', 'subservice'] } }]
    });
    if (!doc) throw new Error('Subservice instance config is missing');
    // 旧清理任务可能已成功，不会因本轮新增废弃字段而重跑；本任务仍需清理本域残留。
    const { overrides } = stripDeprecatedOverrides('subservice', doc.overrides);
    // 既有地址可能包含凭据，解析失败时不能将原始配置带入迁移错误。
    const config = (() => {
      try {
        return resolveDomainEffectiveConfig({ domain: 'subservice', overrides });
      } catch {
        throw new Error('Invalid existing subservice configuration');
      }
    })();
    const paths = doc.explicitDefaultPaths ?? [];
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
      throw new Error('Invalid subservice explicit-default metadata');
    }
    const hasCodeValue = (key: string) =>
      Object.hasOwn(overrides.codeSandbox ?? {}, key) || paths.includes(`codeSandbox.${key}`);
    const source = LegacyConnectionEnvSchema.safeParse({
      ...(!hasCodeValue('url') ? { CODE_SANDBOX_URL: legacyEnv.CODE_SANDBOX_URL?.trim() } : {}),
      ...(!hasCodeValue('token') ? { CODE_SANDBOX_TOKEN: legacyEnv.CODE_SANDBOX_TOKEN } : {})
    });
    if (!source.success) throw new Error('Invalid legacy Code Sandbox connection environment');

    // URL 缺省不再默认指向 localhost；Token 缺省仅在实际迁入历史 URL 时沿用旧默认值。
    const url = hasCodeValue('url') ? config.codeSandbox.url : (source.data.CODE_SANDBOX_URL ?? '');
    const token = hasCodeValue('token')
      ? config.codeSandbox.token
      : (source.data.CODE_SANDBOX_TOKEN ?? (url ? 'codesandbox' : ''));
    // 旧版 enabled 的默认值是 true；URL 尚未迁入时的默认标记不能被新版 false 重新解释。
    const hasStoredEnabled = Object.hasOwn(overrides.codeSandbox ?? {}, 'enabled');
    const oldEnabledDefault = paths.includes('codeSandbox.enabled') && !hasCodeValue('url');
    const enabled =
      hasStoredEnabled || (hasCodeValue('enabled') && !oldEnabledDefault)
        ? config.codeSandbox.enabled
        : Boolean(url && token);
    const mcpEnabled =
      Object.hasOwn(overrides.mcp ?? {}, 'enabled') || paths.includes('mcp.enabled')
        ? config.mcp.enabled
        : Boolean(config.mcp.sseProxyUrl);
    const target = {
      ...overrides,
      codeSandbox: { ...config.codeSandbox, enabled, url, token },
      mcp: { ...config.mcp, enabled: mcpEnabled }
    };
    resolveDomainEffectiveConfig({ domain: 'subservice', overrides: target });
    if (isDeepStrictEqual(target, doc.overrides ?? {})) return { updatedDocuments: 0 };

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
  throw new Error('Subservice connection migration repeatedly conflicted with config updates');
};

/** 验证迁移叶子已持久化或被管理员明确保存为默认值，不能仅依赖默认快照判断完成。 */
export const verifyRehomedSubserviceConnections = async () => {
  const doc = await MongoSystemInstanceConfig.collection.findOne({
    $or: [{ domain: 'subservice' }, { $expr: { $eq: ['$_id', 'subservice'] } }]
  });
  if (!doc) throw new Error('Subservice instance config is missing');
  resolveDomainEffectiveConfig({ domain: 'subservice', overrides: doc.overrides });
  for (const [group, key] of [
    ['codeSandbox', 'url'],
    ['codeSandbox', 'token'],
    ['codeSandbox', 'enabled'],
    ['mcp', 'enabled']
  ] as const) {
    if (
      !Object.hasOwn(doc.overrides?.[group] ?? {}, key) &&
      !doc.explicitDefaultPaths?.includes(`${group}.${key}`)
    ) {
      throw new Error('Subservice connection migration is incomplete');
    }
  }
};
