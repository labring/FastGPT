import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { decryptSecret, encryptSecret } from '../../../common/secret/aes256gcm';
import {
  findActiveModerationConfigs,
  findAllModerationConfigs,
  findEnabledModerationConfig,
  findModerationConfig,
  softDeleteModerationConfig,
  upsertModerationConfig,
  disableOtherModerationConfigs,
  disableAllModerationConfigs,
  enableSingleModerationConfig
} from './entity';
import type { ModerationConfigRecord } from './entity';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';
import {
  DefaultSystemModerationPolicy,
  SystemModerationPolicySchema,
  type SystemModerationPolicyType
} from '@fastgpt/global/core/plugin/moderation/type';
import { MongoSystemConfigs } from '../../../common/system/config/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { ModerationCheckInputType } from '@fastgpt/global/sdk/fastgpt-plugin';
import {
  decryptModerationSecrets,
  encryptModerationSecrets,
  getModerationSecretKeys,
  hasConfiguredModerationSecrets,
  maskModerationSecrets,
  mergeModerationSecretsForUpdate
} from './utils';
import {
  checkModerationContent,
  getModerationPluginDetail,
  listModerationPlugins
} from '../../../thirdProvider/fastgptPlugin/moderation';
/**
 * 把插件详情、本地配置合并成管理列表项。
 *
 * 密钥字段一律脱敏；非密钥字段（策略 ID、接入点等）原样返回，因为用户需要看到它们。
 */
const buildAdminItem = ({
  detail,
  config,
  lang
}: {
  detail: Awaited<ReturnType<typeof getModerationPluginDetail>>;
  config?: ModerationConfigRecord;
  lang?: `${LangEnum}`;
}): AdminModerationPluginItemType => {
  const secretKeys = getModerationSecretKeys(detail.secretSchema);

  return {
    pluginId: detail.pluginId,
    source: detail.source,
    version: detail.version,
    isLatestVersion: detail.isLatestVersion,
    name: parseI18nString(detail.name, lang),
    description: detail.description
      ? parseI18nString(detail.description, lang)
      : undefined,
    icon: detail.icon,
    author: detail.author,
    provider: detail.meta.provider,
    docUrl: detail.meta.docUrl,
    readmeUrl: detail.readmeUrl,
    secretSchema: detail.secretSchema,
    secretsVal: maskModerationSecrets({ secretsVal: config?.secretsVal, secretKeys }),
    hasConfiguredSecrets: hasConfiguredModerationSecrets({
      secretsVal: config?.secretsVal,
      secretKeys
    }),
    enabled: config?.enabled ?? false,
    available: true
  };
};

/**
 * 获取审查插件管理列表。
 *
 * 以 plugin service 的列表为主（它决定了哪些插件真实可用），再合并本地配置。
 * 单个插件拉取详情失败时降级为 `available: false`，而不是让整个列表报错——
 * 一个坏插件不应该把管理页变成白屏。
 */
export const getAdminModerationPluginList = async ({
  lang,
  includeDeleted = false
}: {
  lang?: `${LangEnum}`;
  includeDeleted?: boolean;
} = {}): Promise<AdminModerationPluginItemType[]> => {
  const [plugins, allConfigs] = await Promise.all([
    listModerationPlugins({ lang }),
    findAllModerationConfigs()
  ]);

  const configMap = new Map(allConfigs.map((item) => [item.pluginId, item]));

  // 如果不包含已删除项，则过滤掉已标记删除的插件
  const visiblePlugins = includeDeleted
    ? plugins
    : plugins.filter((plugin) => {
        const config = configMap.get(plugin.pluginId);
        return !config?.deleted;
      });

  const items = await Promise.all(
    visiblePlugins.map(async (plugin) => {
      const config = configMap.get(plugin.pluginId);

      try {
        const detail = await getModerationPluginDetail({
          pluginId: plugin.pluginId,
          source: plugin.source,
          lang
        });
        return buildAdminItem({ detail, config, lang });
      } catch {
        // 插件在 registry 中存在但读不到详情（版本损坏 / 服务不可用）：保底展示基本信息
        return {
          pluginId: plugin.pluginId,
          source: plugin.source,
          version: plugin.version,
          name: parseI18nString(plugin.name, lang),
          description: plugin.description
            ? parseI18nString(plugin.description, lang)
            : undefined,
          icon: plugin.icon,
          author: plugin.author,
          readmeUrl: plugin.readmeUrl,
          provider: 'unknown',
          enabled: config?.enabled ?? false,
          available: false
        } satisfies AdminModerationPluginItemType;
      }
    })
  );

  // 保留已删除记录（includeDeleted 时），它们在 plugin service 中已不存在
  const deletedItems = includeDeleted
    ? allConfigs
        .filter((item) => item.deleted && !plugins.some((p) => p.pluginId === item.pluginId))
        .map(
          (item) =>
            ({
              pluginId: item.pluginId,
              source: item.source ?? 'system',
              version: item.version,
              name: item.pluginId,
              provider: 'unknown',
              enabled: false,
              available: false
            }) satisfies AdminModerationPluginItemType
        )
    : [];

  return [...items, ...deletedItems];
};

/**
 * 保存审查插件配置。
 *
 * 启用是全局互斥的：传 `enabled: true` 会先把其他插件置为停用。
 * 不能启用一个读不到详情的插件，否则运行时一定失败。
 */
export const saveModerationConfig = async ({
  pluginId,
  source,
  version,
  secretsVal,
  enabled,
  lang
}: {
  pluginId: string;
  source?: string;
  version?: string;
  secretsVal?: Record<string, unknown> | null;
  enabled?: boolean;
  lang?: `${LangEnum}`;
}): Promise<AdminModerationPluginItemType> => {
  // 1. 读取插件详情：拿 secretSchema 判断哪些字段要加密，同时验证插件真实存在
  const detail = await getModerationPluginDetail({ pluginId, source, version, lang });

  if (detail.type !== 'moderation') {
    return Promise.reject(`Plugin ${pluginId} is not a moderation plugin`);
  }

  const secretKeys = getModerationSecretKeys(detail.secretSchema);
  const existing = await findModerationConfig({ pluginId, source });

  // 2. 合并并加密配置值：掩码不回写，空值删除，真实值加密
  const merged = mergeModerationSecretsForUpdate({
    incoming: secretsVal,
    existing: existing?.secretsVal,
    secretKeys
  });
  const encrypted = encryptModerationSecrets({
    secretsVal: merged,
    secretKeys,
    encrypt: encryptSecret
  });

  const data = {
    version: detail.version,
    ...(encrypted !== undefined ? { secretsVal: encrypted } : {}),
    ...(enabled !== undefined ? { enabled } : {})
  };

  // 3. 写入。启用时在同一事务内停用其他插件，避免出现两个同时启用的窗口
  const saved = await mongoSessionRun(async (session) => {
    const record = await upsertModerationConfig({
      pluginId,
      source,
      data,
      session
    });

    if (enabled === true) {
      await disableOtherModerationConfigs({ exceptPluginId: pluginId, session });
    }

    return record;
  });

  return buildAdminItem({ detail, config: saved, lang });
};

/**
 * 软删除审查插件。已启用的插件不允许直接删除，必须先停用——
 * 否则运行时会出现「配置指向一个已删除插件」的悬空状态。
 */
export const deleteModerationPlugin = async ({
  pluginId,
  source,
  tmbId
}: {
  pluginId: string;
  source?: string;
  tmbId?: string;
}): Promise<void> => {
  const existing = await findModerationConfig({ pluginId, source });

  if (existing?.enabled) {
    return Promise.reject('Disable the moderation plugin before deleting it');
  }

  await softDeleteModerationConfig({ pluginId, source, tmbId });
};

/**
 * 取当前启用的审查插件及其解密后的配置。
 *
 * 供调用锚点（P2）使用，P1 阶段只被测试调用接口复用。
 * 无启用插件时返回 undefined；插件读不到详情时直接报错（不静默降级），
 * 因为审查属于安全能力，静默失败会变成「以为在审，其实没审」。
 */
export const getEnabledModerationRuntime = async ({
  lang
}: {
  lang?: `${LangEnum}`;
} = {}) => {
  const config = await findEnabledModerationConfig();
  if (!config) return undefined;

  const detail = await getModerationPluginDetail({
    pluginId: config.pluginId,
    source: config.source,
    version: config.version,
    lang
  });

  const secretKeys = getModerationSecretKeys(detail.secretSchema);
  const secrets = decryptModerationSecrets({
    secretsVal: config.secretsVal,
    secretKeys,
    decrypt: decryptSecret
  });

  return {
    pluginId: config.pluginId,
    source: config.source,
    version: detail.version,
    secrets
  };
};

/**
 * 测试调用：用已保存配置或临时传入的配置执行一次同步审查。
 *
 * 区分两类失败：
 * - 框架级失败（插件不存在、进程崩溃）——抛错，让接口返回可读错误
 * - provider 无法判定——正常返回 `verdict: 'error'` 的结果，由调用方展示
 */
export const checkModerationForTest = async ({
  pluginId,
  version,
  secrets,
  input,
  lang
}: {
  pluginId: string;
  version?: string;
  secrets?: Record<string, unknown>;
  input: ModerationCheckInputType;
  lang?: `${LangEnum}`;
}) => {
  const existing = await findModerationConfig({ pluginId });
  const detail = await getModerationPluginDetail({ pluginId, version, lang });
  const secretKeys = getModerationSecretKeys(detail.secretSchema);

  // 临时 secrets 优先；未传则解密已保存配置
  const resolvedSecrets =
    secrets ?
      mergeModerationSecretsForUpdate({
        incoming: secrets,
        existing: existing?.secretsVal,
        secretKeys
      })
    : decryptModerationSecrets({
        secretsVal: existing?.secretsVal,
        secretKeys,
        decrypt: decryptSecret
      });

  return checkModerationContent({
    pluginId,
    version: detail.version,
    source: detail.source,
    secrets: resolvedSecrets,
    /**
     * 管理后台的测试调用不属于任何真实会话，因此不携带业务上下文。
     * provider 侧用它做 scene / sessionId 等去重与场景标识，测试场景留空即可。
     */
    systemVar: {
      app: { id: 'moderation-test', name: 'Moderation Test' },
      chat: { chatId: `moderation-test-${Date.now()}` },
      invokeToken: '',
      time: new Date().toISOString()
    },
    input
  });
};

/**
 * 获取全局内容审核策略配置。
 *
 * 从 MongoSystemConfigs 读取，若不存在或校验失败则回退到默认值，
 * 优先使用数据库中实际启用的审查插件作为 activePluginId。
 */
export const getModerationPolicy = async (): Promise<SystemModerationPolicyType> => {
  const [configRecord, enabledPlugin] = await Promise.all([
    MongoSystemConfigs.findOne({
      type: SystemConfigsTypeEnum.moderationPolicy
    })
      .sort({ createTime: -1 })
      .lean(),
    findEnabledModerationConfig()
  ]);

  const parsed = SystemModerationPolicySchema.safeParse({
    ...DefaultSystemModerationPolicy,
    ...(configRecord?.value ?? {})
  });

  const basePolicy = parsed.success ? parsed.data : DefaultSystemModerationPolicy;

  // 优先以实际已启用的插件作为生效插件；若无启用插件则沿用保存的 activePluginId
  const activePluginId = enabledPlugin?.pluginId ?? basePolicy.activePluginId;

  return {
    ...basePolicy,
    activePluginId
  };
};

/**
 * 更新全局内容审核策略配置。
 *
 * 保存策略（生效环节、处理策略等）到 MongoSystemConfigs，
 * 并同步更新 system_moderation_plugins 的启用状态（保持全局互斥）。
 */
export const updateModerationPolicy = async (
  input: SystemModerationPolicyType
): Promise<SystemModerationPolicyType> => {
  const validated = SystemModerationPolicySchema.parse(input);

  // 1. 同步插件启用状态
  if (validated.enabled && validated.activePluginId) {
    await enableSingleModerationConfig({ pluginId: validated.activePluginId });
  } else if (!validated.enabled) {
    await disableAllModerationConfigs();
  }

  // 2. 保存全局策略记录（使用 findOneAndUpdate upsert 保证全局仅保留单条最新有效记录）
  await MongoSystemConfigs.findOneAndUpdate(
    { type: SystemConfigsTypeEnum.moderationPolicy },
    {
      $set: {
        value: validated,
        createTime: new Date()
      }
    },
    { upsert: true, new: true }
  );

  return validated;
};
