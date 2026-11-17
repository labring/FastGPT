import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  decryptDomainSecrets,
  encryptDomainSecrets
} from '@fastgpt/service/common/system/systemInstanceConfig/secrets';
import { isDeepStrictEqual } from 'node:util';
import z from 'zod';
import { isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';
import { resolveDomainConfigBeforeProxyBackfill, stripDeprecatedOverrides } from './cleanup';
import { NumSchema } from '@fastgpt/global/common/zod';

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
    const doc = await MongoSystemInstanceConfig.collection.findOne(
      {
        $or: [{ domain: 'subservice' }, { $expr: { $eq: ['$_id', 'subservice'] } }]
      },
      { readPreference: 'primary' }
    );
    if (!doc) throw new Error('Subservice instance config is missing');
    // 与统一清理阶段使用同一份废弃声明，单独重试补缺时也不带回旧键。
    const decodedOverrides = decryptDomainSecrets('subservice', doc.overrides ?? {});
    const { overrides } = stripDeprecatedOverrides('subservice', decodedOverrides);
    // 既有地址可能包含凭据，解析失败时不能将原始配置带入迁移错误。
    const config = (() => {
      try {
        return resolveDomainConfigBeforeProxyBackfill({ domain: 'subservice', overrides });
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
    resolveDomainConfigBeforeProxyBackfill({ domain: 'subservice', overrides: target });
    if (isDeepStrictEqual(target, decodedOverrides)) return { updatedDocuments: 0 };

    await assertActive();
    const result = await MongoSystemInstanceConfig.collection.updateOne(
      { _id: doc._id, revision: doc.revision },
      {
        $set: {
          overrides: encryptDomainSecrets({
            domain: 'subservice',
            data: target,
            previousStored: doc.overrides
          }),
          updatedAt: new Date(),
          updatedBy: { actor: 'migration' }
        },
        $inc: { revision: 1 }
      }
    );
    if (result.modifiedCount === 1) return { updatedDocuments: 1 };
  }
  throw new Error('Subservice connection migration repeatedly conflicted with config updates');
};

/** 验证迁移叶子已持久化或被管理员明确保存为默认值，不能仅依赖默认快照判断完成。 */
export const verifyRehomedSubserviceConnections = async () => {
  const doc = await MongoSystemInstanceConfig.collection.findOne(
    {
      $or: [{ domain: 'subservice' }, { $expr: { $eq: ['$_id', 'subservice'] } }]
    },
    { readPreference: 'primary' }
  );
  if (!doc) throw new Error('Subservice instance config is missing');
  resolveDomainEffectiveConfig({
    domain: 'subservice',
    overrides: decryptDomainSecrets('subservice', doc.overrides)
  });
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

const proxyEnvKeys = {
  wsUrl: 'AGENT_SANDBOX_PROXY_URL',
  previewUrl: 'AGENT_SANDBOX_PREVIEW_PROXY_URL',
  secret: 'AGENT_SANDBOX_PROXY_SECRET'
} as const;

/**
 * 单域文档采用幂等全量重跑和 revision CAS，一次性迁入主服务的代理连接配置。
 * 已有叶子与显式默认标记优先；持久化空值防止重跑复活已清空的旧 ENV，不删除旧来源。
 */
export const rehomeAgentSandboxProxy = async ({
  assertActive,
  legacyEnv = process.env
}: {
  assertActive: () => Promise<void>;
  legacyEnv?: Record<string, string | undefined>;
}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await MongoSystemInstanceConfig.collection.findOne(
      { domain: 'subservice' },
      { readPreference: 'primary' }
    );
    if (!doc) throw new Error('Subservice instance config is missing');

    const overrides = decryptDomainSecrets('subservice', doc.overrides ?? {});
    const paths = doc.explicitDefaultPaths ?? [];
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
      throw new Error('Invalid subservice explicit-default metadata');
    }
    try {
      resolveDomainConfigBeforeProxyBackfill({ domain: 'subservice', overrides });
    } catch {
      throw new Error('Invalid existing subservice configuration');
    }
    const previous = overrides.agentSandbox?.proxy ?? {};
    const proxy = Object.fromEntries(
      Object.entries(proxyEnvKeys).map(([key, envKey]) => [
        key,
        Object.hasOwn(previous, key) || paths.includes(`agentSandbox.proxy.${key}`)
          ? (previous[key] ?? '')
          : (legacyEnv[envKey] ?? '')
      ])
    );
    const target = {
      ...overrides,
      agentSandbox: { ...overrides.agentSandbox, proxy }
    };

    // 整域验证完成后才能写入；错误不携带可能含凭据的源值或 Zod 原始 issue。
    try {
      resolveDomainEffectiveConfig({ domain: 'subservice', overrides: target });
    } catch {
      throw new Error('Invalid Agent Sandbox proxy configuration during migration');
    }
    if (isDeepStrictEqual(target, overrides)) return { updatedDocuments: 0 };

    await assertActive();
    const result = await MongoSystemInstanceConfig.collection.updateOne(
      { _id: doc._id, revision: doc.revision },
      {
        $set: {
          overrides: encryptDomainSecrets({
            domain: 'subservice',
            data: target,
            previousStored: doc.overrides
          }),
          updatedAt: new Date(),
          updatedBy: { actor: 'migration' }
        },
        $inc: { revision: 1 }
      }
    );
    if (result.modifiedCount === 1) return { updatedDocuments: 1 };
  }
  throw new Error('Agent Sandbox proxy migration repeatedly conflicted with config updates');
};

/** 验证三个目标叶子均已落库或显式清空，不能把 Schema 默认值当作迁移已完成。 */
export const verifyAgentSandboxProxyMigration = async () => {
  const doc = await MongoSystemInstanceConfig.collection.findOne(
    { domain: 'subservice' },
    { readPreference: 'primary' }
  );
  if (!doc) throw new Error('Subservice instance config is missing');
  try {
    resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: decryptDomainSecrets('subservice', doc.overrides)
    });
  } catch {
    throw new Error('Invalid Agent Sandbox proxy configuration after migration');
  }
  for (const key of Object.keys(proxyEnvKeys)) {
    if (
      !Object.hasOwn(doc.overrides?.agentSandbox?.proxy ?? {}, key) &&
      !doc.explicitDefaultPaths?.includes(`agentSandbox.proxy.${key}`)
    ) {
      throw new Error('Agent Sandbox proxy migration is incomplete');
    }
  }
};

const legacyKeys = {
  cpuOvercommitFactor: 'AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR',
  memoryOvercommitFactor: 'AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR'
} as const;

/** 迁移和完成校验共用的读取边界；错误仅报告配置位置，不复制原配置或源值。 */
const readOvercommitDocument = async ({
  allowPendingProxy = false
}: { allowPendingProxy?: boolean } = {}) => {
  const doc = await MongoSystemInstanceConfig.collection.findOne(
    { domain: 'subservice' },
    { readPreference: 'primary' }
  );
  if (!doc) throw new Error('Subservice instance config is missing');
  const overrides = decryptDomainSecrets('subservice', doc.overrides ?? {});
  const explicitPaths = doc.explicitDefaultPaths ?? [];
  if (!Array.isArray(explicitPaths) || !explicitPaths.every((path) => typeof path === 'string')) {
    throw new Error('Invalid subservice explicit-default metadata');
  }
  const validate = allowPendingProxy
    ? resolveDomainConfigBeforeProxyBackfill
    : resolveDomainEffectiveConfig;
  try {
    validate({ domain: 'subservice', overrides });
  } catch {
    throw new Error('Invalid existing subservice configuration');
  }
  return { doc, overrides, explicitPaths: new Set<string>(explicitPaths) };
};

/**
 * 单文档采用幂等全量重跑与 revision CAS，一次性导入 App 进程的旧超卖 ENV。
 * 已有字段及显式默认值优先；缺少旧值时持久化 1，防止后续重跑重新读取变化后的 ENV。
 */
export const rehomeSandboxOvercommit = async ({
  assertActive,
  legacyEnv = process.env
}: {
  assertActive: () => Promise<void>;
  legacyEnv?: Record<string, string | undefined>;
}) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { doc, overrides, explicitPaths } = await readOvercommitDocument({
      allowPendingProxy: true
    });
    const previous = overrides.agentSandbox?.opensandbox ?? {};
    const missingKeys = (Object.keys(legacyKeys) as (keyof typeof legacyKeys)[]).filter(
      (key) =>
        !Object.hasOwn(previous, key) && !explicitPaths.has(`agentSandbox.opensandbox.${key}`)
    );
    if (missingKeys.length === 0) return { updatedDocuments: 0 };

    const imported = Object.fromEntries(
      missingKeys.map((key) => {
        const raw = legacyEnv[legacyKeys[key]];
        const parsed = NumSchema.min(1).safeParse(raw?.trim() ? raw : 1);
        if (!parsed.success) {
          throw new Error(`Invalid sandbox overcommit migration input: ${legacyKeys[key]}`);
        }
        return [key, parsed.data];
      })
    );
    const target = {
      ...overrides,
      agentSandbox: {
        ...overrides.agentSandbox,
        opensandbox: { ...previous, ...imported }
      }
    };
    try {
      resolveDomainConfigBeforeProxyBackfill({ domain: 'subservice', overrides: target });
    } catch {
      throw new Error('Invalid sandbox overcommit configuration during migration');
    }

    await assertActive();
    const result = await MongoSystemInstanceConfig.collection.updateOne(
      { _id: doc._id, revision: doc.revision },
      {
        $set: {
          overrides: encryptDomainSecrets({
            domain: 'subservice',
            data: target,
            previousStored: doc.overrides
          }),
          updatedAt: new Date(),
          updatedBy: { actor: 'migration' }
        },
        $inc: { revision: 1 }
      }
    );
    if (result.modifiedCount === 1) return { updatedDocuments: 1 };
    // 管理员可能并发保存了其中一个字段；重读后只迁移仍缺失的字段。
  }
  throw new Error('Sandbox overcommit migration repeatedly conflicted with config updates');
};

/** 两项均需有持久化依据；Schema 默认值本身不能证明迁移已完成。 */
export const verifySandboxOvercommitMigration = async () => {
  const { overrides, explicitPaths } = await readOvercommitDocument();
  const config = overrides.agentSandbox?.opensandbox ?? {};
  for (const key of Object.keys(legacyKeys)) {
    if (!Object.hasOwn(config, key) && !explicitPaths.has(`agentSandbox.opensandbox.${key}`)) {
      throw new Error(`Sandbox overcommit migration is incomplete: ${key}`);
    }
  }
};
