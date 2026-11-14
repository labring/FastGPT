import {
  disableSystemPlugin,
  restoreSystemPlugin,
  getRetainedModerationDetail
} from '../../../thirdProvider/fastgptPlugin/lifecycle';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import type { ClientSession } from '../../../common/mongo';
import { decryptSecret, encryptSecret } from '../../../common/secret/aes256gcm';
import {
  findAllModerationConfigs,
  findEnabledModerationConfig,
  findModerationConfig,
  softDeleteModerationConfig,
  restoreModerationConfigs,
  upsertModerationConfig,
  disableOtherModerationConfigs,
  disableAllModerationConfigs,
  enableSingleModerationConfig
} from './entity';
import type { ModerationConfigRecord } from './entity';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';
import { DEFAULT_MODERATION_POLICY_CONFIG_ID } from '@fastgpt/global/core/plugin/moderation/constants';
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

/** 与成功提交的策略变更对应的前态，不包含操作者或外部插件元数据。 */
export type ModerationPolicyAuditSnapshot = {
  prevPolicy: SystemModerationPolicyType;
  prevEnabledPluginId?: string;
};

/** 配置保存事务实际覆盖的启用状态，不包含凭据。 */
export type ModerationConfigAuditSnapshot = {
  prevTargetEnabled: boolean;
  prevActivePluginId?: string;
};

/** 卸载事务实际覆盖的启用状态，不包含外部插件元数据。 */
export type ModerationUninstallAuditSnapshot = {
  wasEnabled: boolean;
};

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
    description: detail.description ? parseI18nString(detail.description, lang) : undefined,
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
    deleted: config?.deleted ?? false,
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
    listModerationPlugins({ lang, ...(includeDeleted ? { includeDisabled: true } : {}) }),
    findAllModerationConfigs()
  ]);

  // Records arrive newest first. Legacy source-less records must not overwrite a newer save.
  const configMap = new Map<string, ModerationConfigRecord>();
  for (const item of allConfigs) {
    const key = `${item.source ?? 'system'}:${item.pluginId}`;
    if (!configMap.has(key)) configMap.set(key, item);
  }
  const getConfig = (plugin: { pluginId: string; source: string }) =>
    configMap.get(`${plugin.source}:${plugin.pluginId}`);
  const visiblePlugins = includeDeleted
    ? plugins
    : plugins.filter((plugin) => !getConfig(plugin)?.deleted);
  const items = await Promise.all(
    visiblePlugins.map(async (plugin) => {
      const config = getConfig(plugin);
      const deleted =
        config?.deleted ||
        ('installationStatus' in plugin && plugin.installationStatus === 'disabled');

      try {
        const detail = deleted
          ? await getRetainedModerationDetail(plugin.pluginId, plugin.source)
          : await getModerationPluginDetail({
              pluginId: plugin.pluginId,
              source: plugin.source,
              lang
            });
        return buildAdminItem({
          detail,
          config: { ...config, pluginId: plugin.pluginId, deleted: Boolean(deleted) },
          lang
        });
      } catch {
        // 插件在 registry 中存在但读不到详情（版本损坏 / 服务不可用）：保底展示基本信息
        return {
          pluginId: plugin.pluginId,
          source: plugin.source,
          version: plugin.version,
          name: parseI18nString(plugin.name, lang),
          description: plugin.description ? parseI18nString(plugin.description, lang) : undefined,
          icon: plugin.icon,
          author: plugin.author,
          readmeUrl: plugin.readmeUrl,
          provider: 'unknown',
          enabled: config?.enabled ?? false,
          deleted: Boolean(deleted),
          available: false
        } satisfies AdminModerationPluginItemType;
      }
    })
  );

  // Retain a recovery entry after prune; restoration will explain that a new package is required.
  const prunedItems: AdminModerationPluginItemType[] = includeDeleted
    ? allConfigs
        .filter(
          (config) =>
            config.deleted &&
            !plugins.some(
              (plugin) =>
                plugin.pluginId === config.pluginId && plugin.source === (config.source ?? 'system')
            )
        )
        .map((config) => ({
          pluginId: config.pluginId,
          source: config.source ?? 'system',
          version: config.version,
          name: config.pluginId,
          provider: 'unknown',
          deleted: true,
          enabled: false,
          available: false
        }))
    : [];
  return [...items, ...prunedItems];
};

/**
 * 权威策略记录竞争点：所有启用操作均争用同一条 moderationPolicy 记录，
 * 通过在同一事务内更新合法字段（value / createTime）产生排他行锁或写冲突，避免并发双启用。
 * 若存在历史重复记录，则以最新策略值为准收敛至单条权威记录。
 */
const syncPolicyContentionRecord = async ({
  session,
  activePluginId,
  policy
}: {
  session?: ClientSession | null;
  activePluginId?: string;
  policy?: SystemModerationPolicyType;
}) => {
  const records = await MongoSystemConfigs.find({
    type: SystemConfigsTypeEnum.moderationPolicy
  })
    .sort({ createTime: -1, _id: -1 })
    .select('_id value')
    .session(session ?? null)
    .lean();

  const latest = records[0];
  const canonicalRecord =
    records.find((item) => String(item._id) === DEFAULT_MODERATION_POLICY_CONFIG_ID) ?? latest;
  const targetId = canonicalRecord?._id ?? DEFAULT_MODERATION_POLICY_CONFIG_ID;
  const rawValue = (() => {
    if (policy) return policy;
    if (latest?.value && typeof latest.value === 'object') {
      return {
        ...DefaultSystemModerationPolicy,
        ...latest.value,
        ...(activePluginId ? { activePluginId } : {})
      };
    }
    return {
      ...DefaultSystemModerationPolicy,
      ...(activePluginId ? { activePluginId } : {})
    };
  })();
  // BSON 会将对象自有的 undefined 属性序列化为 null，进而导致读取时 z.string().optional() 校验失败；无生效插件时直接省略该键。
  const { activePluginId: resolvedActivePluginId, ...restValue } = rawValue;
  const resolvedValue = resolvedActivePluginId
    ? { ...restValue, activePluginId: resolvedActivePluginId }
    : restValue;

  await MongoSystemConfigs.findOneAndUpdate(
    { _id: targetId },
    {
      $set: {
        type: SystemConfigsTypeEnum.moderationPolicy,
        value: resolvedValue,
        createTime: new Date()
      },
      $setOnInsert: {
        _id: targetId
      }
    },
    { upsert: true, new: true, session }
  );

  const duplicateIds = records
    .map((item) => item._id)
    .filter((id) => String(id) !== String(targetId));
  if (duplicateIds.length > 0) {
    await MongoSystemConfigs.deleteMany(
      { _id: { $in: duplicateIds }, type: SystemConfigsTypeEnum.moderationPolicy },
      { session: session ?? undefined }
    );
  }
};

/**
 * 保存审查插件配置。
 *
 * 启用是全局互斥的：传 `enabled: true` 会先把其他插件置为停用。
 * Saving synchronously probes the resolved configuration before any writes or enablement.
 * A block/suspected verdict is a healthy response; provider errors and runtime failures reject the save.
 * 返回脱敏配置与同一事务内的审计前态；只有提交成功后调用方才可记录审计。
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
}): Promise<{
  item: AdminModerationPluginItemType;
  auditSnapshot: ModerationConfigAuditSnapshot;
}> => {
  // 1. 读取插件详情：拿 secretSchema 判断哪些字段要加密，同时验证插件真实存在
  const detail = await getModerationPluginDetail({ pluginId, source, version, lang });

  if (detail.type !== 'moderation') {
    return Promise.reject(`Plugin ${pluginId} is not a moderation plugin`);
  }

  const secretKeys = getModerationSecretKeys(detail.secretSchema);
  const existing = await findModerationConfig({ pluginId, source: detail.source });

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

  // Probe outside the transaction: use merged credentials, never masked values or ciphertext.
  const result = await checkModerationContent({
    pluginId: detail.pluginId,
    source: detail.source,
    version: detail.version,
    secrets: decryptModerationSecrets({
      secretsVal: encrypted,
      secretKeys,
      decrypt: decryptSecret
    }),
    input: { content: 'Hello, this is a content moderation configuration check.' },
    systemVar: {
      app: { id: 'moderation-config-check', name: 'Moderation Configuration Check' },
      chat: { chatId: `moderation-config-check-${Date.now()}` },
      invokeToken: '',
      time: new Date().toISOString()
    }
  });
  if (result.verdict === 'error') {
    throw new Error(result.errorMessage || '内容审核插件配置检测失败');
  }

  const data = {
    version: detail.version,
    ...(encrypted !== undefined ? { secretsVal: encrypted } : {}),
    ...(enabled !== undefined ? { enabled } : {})
  };

  // 3. 写入。启用时在同一事务内停用其他插件，避免出现两个同时启用的窗口
  const { saved, auditSnapshot } = await mongoSessionRun(async (session) => {
    // 前态必须与写入共享 session；写冲突重试时重新读取，不能复用事务外的旧快照。
    const prevTarget = await findModerationConfig({ pluginId, source: detail.source }, session);
    const prevActive = await findEnabledModerationConfig(session);
    const auditSnapshot: ModerationConfigAuditSnapshot = {
      prevTargetEnabled: Boolean(prevTarget?.enabled),
      prevActivePluginId: prevActive?.pluginId
    };

    if (enabled === true) {
      await syncPolicyContentionRecord({ session, activePluginId: pluginId });
    }

    const record = await upsertModerationConfig({
      pluginId,
      source: detail.source,
      data,
      session
    });

    if (enabled === true) {
      await disableOtherModerationConfigs({ exceptPluginId: pluginId, session });
    }

    return { saved: record, auditSnapshot };
  });

  return { item: buildAdminItem({ detail, config: saved, lang }), auditSnapshot };
};

/**
 * 软卸载内容审核插件并保留已存配置以便重装恢复。
 *
 * - 当还存在其他已安装的审核插件时，禁止直接卸载当前启用中的插件（需先切换生效插件或停用审核）。
 * - 当卸载的是系统中最后一个已安装的内容审核插件时，允许直接卸载，并在同一事务内自动关闭全局内容审核总开关。
 * - 返回提交事务实际覆盖的启用前态，审计日志由调用方在事务提交后记录。
 */
export const deleteModerationPlugin = async ({
  pluginId,
  source
}: {
  pluginId: string;
  source?: string;
}): Promise<{
  auditSnapshot: ModerationUninstallAuditSnapshot;
}> => {
  if (source && source !== 'system')
    throw new Error('Only system moderation plugins can be uninstalled here');

  // 1. 读取远端插件清单与本地配置，仍存在其他可用审核插件时拒绝直接卸载启用中的插件。
  const [existing, remotePlugins, allConfigs] = await Promise.all([
    findModerationConfig({ pluginId, source }),
    listModerationPlugins(),
    findAllModerationConfigs()
  ]);

  const configMap = new Map<string, ModerationConfigRecord>();
  for (const item of allConfigs) {
    const key = `${item.source ?? 'system'}:${item.pluginId}`;
    if (!configMap.has(key)) configMap.set(key, item);
  }
  const targetKey = `${source ?? 'system'}:${pluginId}`;
  const remainingInstalledPlugins = remotePlugins.filter((plugin) => {
    const key = `${plugin.source ?? 'system'}:${plugin.pluginId}`;
    if (key === targetKey) return false;
    if ('installationStatus' in plugin && plugin.installationStatus === 'disabled') {
      return false;
    }
    return !configMap.get(key)?.deleted;
  });
  const isLastModerationPlugin = remainingInstalledPlugins.length === 0;

  if (existing?.enabled && !isLastModerationPlugin) {
    return Promise.reject('Disable the moderation plugin before deleting it');
  }

  // 2. 先在插件服务端软停用系统插件，避免外部 RPC 进入数据库事务。
  await disableSystemPlugin(pluginId);

  // 3. 在同一事务内读取实际停用前态、软删除本地配置，并在停用最后插件（或并发刚被启用的目标插件）时关闭全局策略。
  const auditSnapshot = await mongoSessionRun(async (session) => {
    const prevTarget = await findModerationConfig({ pluginId, source }, session);
    const policyState =
      isLastModerationPlugin || prevTarget?.enabled
        ? await readModerationPolicyState(session)
        : undefined;
    const wasEnabled =
      Boolean(prevTarget?.enabled) ||
      Boolean(
        policyState &&
        (policyState.enabledPluginId === pluginId ||
          (policyState.policy.enabled && policyState.policy.activePluginId === pluginId))
      );

    await softDeleteModerationConfig({
      pluginId,
      source,
      ...(session ? { session } : {})
    });

    if (
      policyState &&
      (isLastModerationPlugin ||
        policyState.enabledPluginId === pluginId ||
        policyState.policy.activePluginId === pluginId)
    ) {
      await syncPolicyContentionRecord({
        session,
        policy: {
          ...policyState.policy,
          enabled: false,
          activePluginId: undefined
        }
      });
      if (isLastModerationPlugin) {
        await disableAllModerationConfigs({ session });
      }
    }

    return { wasEnabled };
  });

  return { auditSnapshot };
};

/** Validate the installed package before restoring its local state; keep it disabled. */
export const restoreModerationPlugin = async ({
  pluginId,
  source = 'system',
  session
}: {
  pluginId: string;
  source?: string;
  session?: ClientSession;
}) => {
  if (source !== 'system') throw new Error('Only system moderation plugins can be restored here');
  const detail = await getRetainedModerationDetail(pluginId, source);
  if (detail.type !== 'moderation') throw new Error('Not a moderation plugin');
  await restoreSystemPlugin(pluginId);
  await restoreModerationConfigs({
    pluginIds: [pluginId],
    source,
    ...(session ? { session } : {})
  });
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
    source: config.source ?? 'system',
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
    source: config.source ?? 'system',
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

  const decryptedExisting = existing?.secretsVal
    ? decryptModerationSecrets({
        secretsVal: existing.secretsVal,
        secretKeys,
        decrypt: decryptSecret
      })
    : undefined;

  // 临时 secrets 优先（与解密后的已有配置合并，保留未编辑掩码代表的明文凭据）；未传则直接使用解密配置
  const resolvedSecrets = secrets
    ? mergeModerationSecretsForUpdate({
        incoming: secrets,
        existing: decryptedExisting,
        secretKeys
      })
    : decryptedExisting;

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
 * 读取全局策略及实际启用插件，供查询与事务内审计共同使用。
 *
 * 从 MongoSystemConfigs 读取，若不存在或校验失败则回退到默认值，
 * 优先使用数据库中实际启用的审查插件作为 activePluginId。
 */
const readModerationPolicyState = async (session?: ClientSession) => {
  // 同一 session 内顺序查询，确保前态与后续写入处于同一事务快照。
  const configRecord = await MongoSystemConfigs.findOne({
    type: SystemConfigsTypeEnum.moderationPolicy
  })
    .sort({ createTime: -1, _id: -1 })
    .session(session ?? null)
    .lean();
  const enabledPlugin = await findEnabledModerationConfig(session);

  const rawConfigValue =
    configRecord?.value && typeof configRecord.value === 'object' ? configRecord.value : {};
  const parsed = SystemModerationPolicySchema.safeParse({
    ...DefaultSystemModerationPolicy,
    ...rawConfigValue,
    activePluginId:
      typeof (rawConfigValue as Record<string, unknown>).activePluginId === 'string'
        ? (rawConfigValue as Record<string, unknown>).activePluginId
        : undefined
  });

  const basePolicy = parsed.success ? parsed.data : DefaultSystemModerationPolicy;

  // 优先以实际已启用的插件作为生效插件；若无启用插件则沿用保存的 activePluginId
  const activePluginId = enabledPlugin?.pluginId ?? basePolicy.activePluginId;

  return {
    policy: { ...basePolicy, activePluginId },
    enabledPluginId: enabledPlugin?.pluginId
  };
};

/** 获取全局内容审核策略，以实际启用的插件校正生效插件，缺失或无效配置回退到默认值。 */
export const getModerationPolicy = async (): Promise<SystemModerationPolicyType> => {
  const { policy } = await readModerationPolicyState();
  return policy;
};

/**
 * 更新全局内容审核策略配置。
 *
 * 保存策略（生效环节、处理策略等）到 MongoSystemConfigs，
 * 并同步更新 system_moderation_plugins 的启用状态（保持全局互斥）。
 * 返回策略和提交事务实际覆盖的前态，审计写入由调用方在提交成功后执行。
 */
export const updateModerationPolicy = async (
  input: SystemModerationPolicyType
): Promise<{
  policy: SystemModerationPolicyType;
  auditSnapshot: ModerationPolicyAuditSnapshot;
}> => {
  const validated = SystemModerationPolicySchema.parse(input);

  // Reject incomplete enabled policies before changing plugin state or persisting configuration.
  if (validated.enabled && !validated.activePluginId) {
    throw new Error('请选择一个审核插件后再保存');
  }

  return await mongoSessionRun(async (session) => {
    // 1. 在更新事务内读取前态，冲突重试时重新生成，避免并发切换或策略恢复漏记日志。
    const { policy: prevPolicy, enabledPluginId } = await readModerationPolicyState(session);
    const auditSnapshot: ModerationPolicyAuditSnapshot = {
      prevPolicy,
      prevEnabledPluginId:
        enabledPluginId ?? (prevPolicy.enabled ? prevPolicy.activePluginId : undefined)
    };

    // 2. 争用权威记录并同步插件启用状态，保证前态与实际覆盖的状态一致。
    await syncPolicyContentionRecord({ session, policy: validated });

    if (validated.enabled && validated.activePluginId) {
      await enableSingleModerationConfig({ pluginId: validated.activePluginId, session });
    } else if (!validated.enabled) {
      await disableAllModerationConfigs({ session });
    }

    return { policy: validated, auditSnapshot };
  });
};
