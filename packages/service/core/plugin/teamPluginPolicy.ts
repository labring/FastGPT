import { SystemToolCodec } from '@fastgpt/global/core/app/tool/systemTool/codec';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { SystemToolListItemType } from '@fastgpt/global/core/app/tool/systemTool/type';
import {
  getTeamPluginSource,
  isDebugToolSource,
  isTeamPluginSource,
  parseTeamPluginSource
} from '@fastgpt/global/core/app/tool/utils';
import {
  TeamPluginPolicyStatusEnum,
  TeamPluginRegistrySourceEnum,
  type TeamInstalledPluginSchemaType,
  type TeamPluginInstallSourceEnum
} from '@fastgpt/global/core/plugin/schema/type';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { MongoTeamInstalledPlugin } from './schema/teamInstalledPluginSchema';
import { SystemToolRepo } from '../app/tool/systemTool/systemTool.repo';

export type TeamPluginPolicyRecord = TeamInstalledPluginSchemaType;

export type TeamPluginListItem = SystemToolListItemType & {
  registrySource: TeamPluginRegistrySourceEnum;
  installSource?: TeamPluginInstallSourceEnum;
  teamInstallStatus: TeamPluginPolicyStatusEnum | 'system';
  confirmedPermissions?: string[];
  installedVersion?: string;
  installedEtag?: string;
  canManage: boolean;
};

export type TeamPluginListFilter = {
  includeDeleted?: boolean;
  includeDebug?: boolean;
  source?: 'all' | 'system' | 'team';
};

export const normalizeTeamPluginStatus = (status?: PluginStatusType) =>
  status === PluginStatusEnum.SoonOffline ? PluginStatusEnum.Normal : status;

/** Reject team plugin installation endpoints unless the feature is explicitly enabled. */
export function assertTeamPluginInstallEnabled() {
  if (global.feConfigs?.enable_team_plugin_upload !== true) {
    throw TeamErrEnum.teamPluginInstallDisabled;
  }
}

export const getRawPluginIdFromSystemToolId = (toolId: string) =>
  SystemToolCodec.getPluginIdFromDB(toolId).split('/')[0];

export const getTeamPluginPolicyStatus = (policy?: TeamInstalledPluginSchemaType | null) => {
  if (!policy) return undefined;
  if (policy.status) return policy.status;
  return policy.installed === false
    ? TeamPluginPolicyStatusEnum.deleted
    : TeamPluginPolicyStatusEnum.installed;
};

export const getTeamPluginPolicyMap = async (teamId: string) => {
  const policies = await MongoTeamInstalledPlugin.find({ teamId }).lean();
  return new Map(policies.map((policy) => [policy.pluginId, policy]));
};

export const getTeamPluginPolicy = async ({
  teamId,
  pluginId
}: {
  teamId: string;
  pluginId: string;
}) => MongoTeamInstalledPlugin.findOne({ teamId, pluginId }).lean();

export const assertTeamPluginInstalled = async ({
  teamId,
  pluginId
}: {
  teamId: string;
  pluginId: string;
}) => {
  const policy = await getTeamPluginPolicy({ teamId, pluginId });

  if (getTeamPluginPolicyStatus(policy) !== TeamPluginPolicyStatusEnum.installed) {
    return Promise.reject('plugin.team_not_installed');
  }

  return policy;
};

/** 校验持久化 team source 属于当前执行团队，并确认插件授权仍有效。 */
export const assertTeamPluginSourceAccess = async ({
  teamId,
  source,
  pluginId
}: {
  teamId: string;
  source: string;
  pluginId: string;
}) => {
  const parsedSource = parseTeamPluginSource(source);
  if (!parsedSource || parsedSource.teamId !== teamId) {
    return Promise.reject('plugin.team_source_forbidden');
  }

  await assertTeamPluginInstalled({ teamId, pluginId });
  return source;
};

/** 安装成功后从同一 team source 读回，避免账本先于 plugin service 生效。 */
export const assertTeamPluginSourceReady = async ({
  teamId,
  tools
}: {
  teamId: string;
  tools: { pluginId: string; version?: string }[];
}) => {
  const systemToolRepo = SystemToolRepo.getInstance();
  const source = getTeamPluginSource(teamId);

  await Promise.all(
    tools.map((tool) =>
      systemToolRepo.getSystemToolRuntime({
        pluginId: SystemToolCodec.getDBPluginId(getRawPluginIdFromSystemToolId(tool.pluginId)),
        version: tool.version,
        source
      })
    )
  ).catch(() => Promise.reject('plugin.team_source_install_failed'));
};

export const upsertTeamInstalledPluginPolicy = async ({
  teamId,
  tmbId,
  pluginId,
  version,
  etag,
  installSource,
  confirmedPermissions,
  packageSource
}: {
  teamId: string;
  tmbId: string;
  pluginId: string;
  version?: string;
  etag?: string;
  installSource: TeamPluginInstallSourceEnum;
  confirmedPermissions?: string[];
  packageSource?: TeamInstalledPluginSchemaType['packageSource'];
}) => {
  const now = new Date();

  return MongoTeamInstalledPlugin.findOneAndUpdate(
    { teamId, pluginId },
    {
      $set: {
        teamId,
        pluginType: 'tool',
        pluginId,
        version,
        etag,
        installSource,
        status: TeamPluginPolicyStatusEnum.installed,
        installed: true,
        confirmedPermissions: confirmedPermissions ?? [],
        permissionsConfirmedAt: now,
        packageSource,
        installedByTmbId: tmbId,
        installedAt: now,
        updatedByTmbId: tmbId,
        updatedAt: now,
        updateTime: now
      },
      $setOnInsert: {
        createTime: now
      }
    },
    {
      upsert: true,
      new: true
    }
  );
};

export const setTeamPluginDeleted = async ({
  teamId,
  tmbId,
  pluginId
}: {
  teamId: string;
  tmbId: string;
  pluginId: string;
}) => {
  const now = new Date();

  return MongoTeamInstalledPlugin.findOneAndUpdate(
    { teamId, pluginId },
    {
      $set: {
        status: TeamPluginPolicyStatusEnum.deleted,
        installed: false,
        deletedByTmbId: tmbId,
        deletedAt: now,
        updatedByTmbId: tmbId,
        updatedAt: now,
        updateTime: now
      }
    },
    { new: true }
  );
};

const getToolRegistrySource = ({
  tool,
  teamId
}: {
  tool: SystemToolListItemType;
  teamId: string;
}) => {
  if (isDebugToolSource(tool.source)) return undefined;
  if (isTeamPluginSource(tool.source)) {
    return parseTeamPluginSource(tool.source)?.teamId === teamId
      ? TeamPluginRegistrySourceEnum.team
      : undefined;
  }
  return TeamPluginRegistrySourceEnum.system;
};

const buildDeletedToolPlaceholder = ({
  policy,
  canManage
}: {
  policy: TeamInstalledPluginSchemaType;
  canManage: boolean;
}): TeamPluginListItem => ({
  id: SystemToolCodec.getDBPluginId(policy.pluginId),
  version: policy.version ?? '',
  versionLabel: policy.version,
  etag: policy.etag,
  status: PluginStatusEnum.Normal,
  source: getTeamPluginSource(String(policy.teamId)),
  isToolSet: false,
  avatar: '',
  name: policy.pluginId,
  intro: '',
  author: '',
  tags: [],
  userGuide: undefined,
  pluginOrder: 0,
  originCost: 0,
  currentCost: 0,
  systemKeyCost: 0,
  hasTokenFee: false,
  hasSystemSecret: false,
  systemSecretStatus: SystemToolSystemSecretStatusEnum.none,
  hideTags: [],
  promoteTags: [],
  registrySource: TeamPluginRegistrySourceEnum.team,
  installSource: policy.installSource,
  teamInstallStatus: TeamPluginPolicyStatusEnum.deleted,
  confirmedPermissions: policy.confirmedPermissions,
  installedVersion: policy.version,
  installedEtag: policy.etag,
  canManage
});

export const resolveTeamPluginList = ({
  teamId,
  tools,
  policyMap,
  filter = {},
  canManage
}: {
  teamId: string;
  tools: SystemToolListItemType[];
  policyMap: Map<string, TeamInstalledPluginSchemaType>;
  filter?: TeamPluginListFilter;
  canManage: boolean;
}): TeamPluginListItem[] => {
  const seenTeamPluginIds = new Set<string>();

  const list = tools.flatMap<TeamPluginListItem>((tool) => {
    if (isDebugToolSource(tool.source)) {
      if (filter.includeDebug === false || (filter.source && filter.source !== 'all')) {
        return [];
      }
      return [
        {
          ...tool,
          registrySource: TeamPluginRegistrySourceEnum.system,
          teamInstallStatus: 'system',
          canManage
        }
      ];
    }

    const registrySource = getToolRegistrySource({ tool, teamId });
    if (!registrySource) return [];
    if (filter.source && filter.source !== 'all' && filter.source !== registrySource) return [];

    const pluginId = getRawPluginIdFromSystemToolId(tool.id);
    if (registrySource === TeamPluginRegistrySourceEnum.system) {
      return [
        {
          ...tool,
          registrySource,
          teamInstallStatus: 'system',
          canManage
        }
      ];
    }

    const policy = policyMap.get(pluginId);
    if (!policy) return [];
    const status = getTeamPluginPolicyStatus(policy);
    seenTeamPluginIds.add(pluginId);
    if (status === TeamPluginPolicyStatusEnum.deleted && !filter.includeDeleted) return [];
    if (status !== TeamPluginPolicyStatusEnum.installed && !filter.includeDeleted) return [];

    return [
      {
        ...tool,
        status: normalizeTeamPluginStatus(tool.status) ?? PluginStatusEnum.Normal,
        registrySource,
        installSource: policy.installSource,
        teamInstallStatus: status ?? TeamPluginPolicyStatusEnum.deleted,
        confirmedPermissions: policy.confirmedPermissions,
        installedVersion: policy.version,
        installedEtag: policy.etag,
        canManage
      }
    ];
  });

  if (filter.includeDeleted) {
    policyMap.forEach((policy) => {
      if (
        getTeamPluginPolicyStatus(policy) !== TeamPluginPolicyStatusEnum.deleted ||
        seenTeamPluginIds.has(policy.pluginId) ||
        (filter.source && filter.source !== TeamPluginRegistrySourceEnum.team)
      ) {
        return;
      }

      list.push(buildDeletedToolPlaceholder({ policy, canManage }));
    });
  }

  return list;
};
