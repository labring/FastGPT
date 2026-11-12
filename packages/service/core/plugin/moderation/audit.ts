import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { SystemModerationPolicyType } from '@fastgpt/global/core/plugin/moderation/type';
import { addAuditLogs, type AuditLogInput } from '../../../support/user/audit/util';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  getModerationPluginDetail,
  listModerationPlugins
} from '../../../thirdProvider/fastgptPlugin/moderation';
import { getRetainedModerationDetail } from '../../../thirdProvider/fastgptPlugin/lifecycle';
import { findModerationConfig } from './entity';
import type { ModerationPolicyAuditSnapshot, ModerationConfigAuditSnapshot } from './service';

const logger = getLogger(LogCategories.MODULE.PLUGIN.ADMIN);

export type ModerationAuditOperator = {
  teamId?: string;
  tmbId?: string;
};

export type ModerationUninstallAuditSnapshot = {
  wasEnabled: boolean;
  pluginName: string;
};

const isValidAuditOperator = (
  operator?: ModerationAuditOperator
): operator is { teamId: string; tmbId: string } => Boolean(operator?.teamId && operator?.tmbId);

const pickPluginName = (resolved: string | undefined, fallbackId: string): string =>
  resolved !== undefined && resolved.trim() !== '' ? resolved : fallbackId;

/**
 * Resolve a readable display name for a moderation plugin.
 *
 * Checks active plugin metadata first, falls back to retained (soft-uninstalled) metadata,
 * and finally falls back to `pluginId` so audit logging never fails when remote metadata is unavailable.
 */
export const resolveModerationPluginName = async ({
  pluginId,
  source = 'system',
  lang
}: {
  pluginId: string;
  source?: string;
  lang?: `${LangEnum}`;
}): Promise<string> => {
  try {
    const detail = await getModerationPluginDetail({ pluginId, source, lang });
    return pickPluginName(parseI18nString(detail.name, lang), pluginId);
  } catch {
    try {
      const retained = await getRetainedModerationDetail(pluginId, source);
      return pickPluginName(parseI18nString(retained.name, lang), pluginId);
    } catch {
      return pluginId;
    }
  }
};

/**
 * Determine whether global moderation policy hooks or strategy fields changed.
 *
 * Excludes `enabled` and `activePluginId` so toggling or switching the active plugin
 * does not emit a duplicate policy-update audit entry when policy rules are unchanged.
 */
export const hasModerationPolicyConfigChanged = ({
  prevPolicy,
  nextPolicy
}: {
  prevPolicy: SystemModerationPolicyType;
  nextPolicy: SystemModerationPolicyType;
}): boolean =>
  prevPolicy.hooks.userInput !== nextPolicy.hooks.userInput ||
  prevPolicy.hooks.modelInput !== nextPolicy.hooks.modelInput ||
  prevPolicy.hooks.finalOutput !== nextPolicy.hooks.finalOutput ||
  prevPolicy.strategy.streamInterval !== nextPolicy.strategy.streamInterval ||
  prevPolicy.strategy.suspectedRiskAction !== nextPolicy.strategy.suspectedRiskAction ||
  prevPolicy.strategy.serviceExceptionAction !== nextPolicy.strategy.serviceExceptionAction;

/**
 * Record admin audit logs after `updateModerationPolicy` succeeds.
 *
 * Emits plugin disable/enable events when the active moderation plugin changes,
 * and emits a policy config update event only when `hooks` or `strategy` changed.
 */
export const recordModerationPolicyAudit = async ({
  operator,
  snapshot,
  nextPolicy,
  lang
}: {
  operator?: ModerationAuditOperator;
  snapshot?: ModerationPolicyAuditSnapshot;
  nextPolicy: SystemModerationPolicyType;
  lang?: `${LangEnum}`;
}): Promise<void> => {
  if (!isValidAuditOperator(operator) || !snapshot) return;

  const { teamId, tmbId } = operator;
  const { prevPolicy, prevEnabledPluginId } = snapshot;
  const nextEnabledPluginId = nextPolicy.enabled ? nextPolicy.activePluginId : undefined;
  const logs: AuditLogInput[] = [];

  // 1. 先记录旧生效插件关闭，再记录新生效插件开启，保持审计时间线与互斥切换顺序一致。
  if (prevEnabledPluginId && prevEnabledPluginId !== nextEnabledPluginId) {
    const prevPluginName = await resolveModerationPluginName({
      pluginId: prevEnabledPluginId,
      lang
    });
    logs.push({
      teamId,
      tmbId,
      event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
      params: { pluginName: prevPluginName }
    });
  }

  if (nextEnabledPluginId && nextEnabledPluginId !== prevEnabledPluginId) {
    const nextPluginName = await resolveModerationPluginName({
      pluginId: nextEnabledPluginId,
      lang
    });
    logs.push({
      teamId,
      tmbId,
      event: AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN,
      params: { pluginName: nextPluginName }
    });
  }

  // 2. 仅当生效环节或处理策略实际变化时记录策略修改日志。
  if (hasModerationPolicyConfigChanged({ prevPolicy, nextPolicy })) {
    logs.push({
      teamId,
      tmbId,
      event: AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_POLICY
    });
  }

  await addAuditLogs(logs);
};

/**
 * Record admin audit logs after `saveModerationConfig` succeeds.
 *
 * Never writes `secretsVal` (plain or masked) into audit metadata; only logs plugin display name.
 */
export const recordModerationConfigAudit = async ({
  operator,
  snapshot,
  pluginId,
  pluginName,
  secretsUpdated,
  nextEnabled,
  lang
}: {
  operator?: ModerationAuditOperator;
  snapshot?: ModerationConfigAuditSnapshot;
  pluginId: string;
  pluginName?: string;
  secretsUpdated: boolean;
  nextEnabled?: boolean;
  lang?: `${LangEnum}`;
}): Promise<void> => {
  if (!isValidAuditOperator(operator)) return;

  const { teamId, tmbId } = operator;
  const resolvedName =
    pluginName !== undefined && pluginName.trim() !== ''
      ? pluginName
      : await resolveModerationPluginName({ pluginId, lang });
  const logs: AuditLogInput[] = [];

  // 1. 记录配置参数更新（不记录任何密钥或参数原文）。
  if (secretsUpdated) {
    logs.push({
      teamId,
      tmbId,
      event: AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_PLUGIN_CONFIG,
      params: { pluginName: resolvedName }
    });
  }

  // 2. 若本次调用显式变更了插件启用状态，同步记录旧插件停用与目标插件启停。
  if (nextEnabled === true) {
    if (snapshot?.prevActivePluginId && snapshot.prevActivePluginId !== pluginId) {
      const prevActiveName = await resolveModerationPluginName({
        pluginId: snapshot.prevActivePluginId,
        lang
      });
      logs.push({
        teamId,
        tmbId,
        event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
        params: { pluginName: prevActiveName }
      });
    }

    if (!snapshot?.prevTargetEnabled) {
      logs.push({
        teamId,
        tmbId,
        event: AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN,
        params: { pluginName: resolvedName }
      });
    }
  } else if (nextEnabled === false && snapshot?.prevTargetEnabled) {
    logs.push({
      teamId,
      tmbId,
      event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
      params: { pluginName: resolvedName }
    });
  }

  await addAuditLogs(logs);
};

/**
 * Capture plugin display name and enablement state before `deleteModerationPlugin` disables it.
 */
export const captureModerationUninstallAuditSnapshot = async ({
  operator,
  pluginId,
  source,
  lang
}: {
  operator?: ModerationAuditOperator;
  pluginId: string;
  source?: string;
  lang?: `${LangEnum}`;
}): Promise<ModerationUninstallAuditSnapshot | undefined> => {
  if (!isValidAuditOperator(operator)) return undefined;

  try {
    const [existing, pluginName] = await Promise.all([
      findModerationConfig({ pluginId, source }),
      resolveModerationPluginName({ pluginId, source, lang })
    ]);

    return {
      wasEnabled: Boolean(existing?.enabled),
      pluginName
    };
  } catch (error) {
    logger.warn('Failed to capture moderation uninstall audit snapshot', { error, pluginId });
    return {
      wasEnabled: false,
      pluginName: pluginId
    };
  }
};

/**
 * Record admin audit logs after `deleteModerationPlugin` succeeds.
 *
 * When uninstalling the last active moderation plugin automatically turns off moderation,
 * records both the plugin disable event and the uninstall event in chronological order.
 */
export const recordModerationUninstallAudit = async ({
  operator,
  pluginId,
  snapshot
}: {
  operator?: ModerationAuditOperator;
  pluginId: string;
  snapshot?: ModerationUninstallAuditSnapshot;
}): Promise<void> => {
  if (!isValidAuditOperator(operator)) return;

  const { teamId, tmbId } = operator;
  const pluginName = pickPluginName(snapshot?.pluginName, pluginId);
  const logs: AuditLogInput[] = [];

  if (snapshot?.wasEnabled) {
    logs.push({
      teamId,
      tmbId,
      event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
      params: { pluginName }
    });
  }

  logs.push({
    teamId,
    tmbId,
    event: AdminAuditEventEnum.ADMIN_UNINSTALL_MODERATION_PLUGIN,
    params: { pluginName }
  });

  await addAuditLogs(logs);
};

/**
 * Record an install audit log after restoring a previously soft-uninstalled moderation plugin.
 */
export const recordModerationRestoreAudit = async ({
  operator,
  pluginId,
  source,
  lang
}: {
  operator?: ModerationAuditOperator;
  pluginId: string;
  source?: string;
  lang?: `${LangEnum}`;
}): Promise<void> => {
  if (!isValidAuditOperator(operator)) return;

  const pluginName = await resolveModerationPluginName({ pluginId, source, lang });
  await addAuditLogs([
    {
      teamId: operator.teamId,
      tmbId: operator.tmbId,
      event: AdminAuditEventEnum.ADMIN_INSTALL_MODERATION_PLUGIN,
      params: { pluginName }
    }
  ]);
};

/**
 * Inspect newly installed/confirmed system plugin IDs and record install audit logs
 * only for packages whose plugin type is `moderation`.
 */
export const recordInstalledModerationPluginsAudit = async ({
  operator,
  pluginIds,
  lang
}: {
  operator?: ModerationAuditOperator;
  pluginIds: string[];
  lang?: `${LangEnum}`;
}): Promise<void> => {
  if (!isValidAuditOperator(operator)) return;

  // 1. 安装入口只传入成功的 ID；去重后避免同一插件重复记账。
  const uniquePluginIds = Array.from(new Set(pluginIds.filter(Boolean)));
  if (uniquePluginIds.length === 0) return;

  try {
    // 2. 读取审核插件类型列表，避免把同批安装的工具或模型插件记为审核插件。
    const moderationPlugins = await listModerationPlugins({ lang });
    const moderationByPluginId = new Map(
      moderationPlugins.map((plugin) => [plugin.pluginId, plugin])
    );

    // 3. 仅记录成功安装集合与审核类型的交集，名称缺失时使用插件 ID 兜底。
    const logs: AuditLogInput[] = uniquePluginIds
      .filter((pluginId) => moderationByPluginId.has(pluginId))
      .map((pluginId) => {
        const plugin = moderationByPluginId.get(pluginId);
        const pluginName = pickPluginName(
          plugin ? parseI18nString(plugin.name, lang) : undefined,
          pluginId
        );
        return {
          teamId: operator.teamId,
          tmbId: operator.tmbId,
          event: AdminAuditEventEnum.ADMIN_INSTALL_MODERATION_PLUGIN,
          params: { pluginName }
        };
      });

    // 4. 批量写入审计；列表读取或记账失败只告警，不能将已成功的安装变成接口失败。
    await addAuditLogs(logs);
  } catch (error) {
    logger.warn('Failed to record installed moderation plugins audit', {
      error,
      pluginIds: uniquePluginIds
    });
  }
};
