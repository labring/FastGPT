import { SystemToolCodec } from '@fastgpt/global/core/app/tool/systemTool/codec';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { SystemToolListItemType } from '@fastgpt/global/core/app/tool/systemTool/type';
import { isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';
import {
  TeamPluginInstallSourceEnum,
  TeamPluginPolicyStatusEnum,
  TeamPluginRegistrySourceEnum,
  type TeamInstalledPluginSchemaType
} from '@fastgpt/global/core/plugin/schema/type';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoTeamInstalledPlugin } from './schema/teamInstalledPluginSchema';
import { MongoTeamPluginTag } from './schema/teamPluginTagSchema';
import { SystemToolRepo } from '../app/tool/systemTool/systemTool.repo';

export type TeamPluginPolicyRecord = TeamInstalledPluginSchemaType;

export type TeamPluginListItem = SystemToolListItemType & {
  registrySource: TeamPluginRegistrySourceEnum;
  installSource?: TeamPluginInstallSourceEnum;
  teamInstallStatus: TeamPluginPolicyStatusEnum | 'system';
  teamHidden: boolean;
  teamTagIds: string[];
  confirmedPermissions?: string[];
  installedVersion?: string;
  installedEtag?: string;
  canManage: boolean;
};

export type TeamPluginListFilter = {
  includeHidden?: boolean;
  includeDeleted?: boolean;
  includeDebug?: boolean;
  source?: 'all' | 'system' | 'team';
  teamTagIds?: string[];
};

export const normalizeTeamPluginStatus = (status?: PluginStatusType) =>
  status === PluginStatusEnum.SoonOffline ? PluginStatusEnum.Normal : status;

const policyKey = ({
  registrySource,
  pluginId
}: {
  registrySource: TeamPluginRegistrySourceEnum;
  pluginId: string;
}) => `${registrySource}:${pluginId}`;

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
  return new Map(
    policies.map((policy) => [
      policyKey({
        registrySource: policy.registrySource ?? TeamPluginRegistrySourceEnum.team,
        pluginId: policy.pluginId
      }),
      policy
    ])
  );
};

export const getTeamPluginPolicy = async ({
  teamId,
  pluginId,
  registrySource
}: {
  teamId: string;
  pluginId: string;
  registrySource: TeamPluginRegistrySourceEnum;
}) =>
  MongoTeamInstalledPlugin.findOne({
    teamId,
    pluginId,
    registrySource
  }).lean();

export const assertTeamPluginInstalled = async ({
  teamId,
  pluginId
}: {
  teamId: string;
  pluginId: string;
}) => {
  const policy = await getTeamPluginPolicy({
    teamId,
    pluginId,
    registrySource: TeamPluginRegistrySourceEnum.team
  });

  if (getTeamPluginPolicyStatus(policy) !== TeamPluginPolicyStatusEnum.installed) {
    return Promise.reject('plugin.team_not_installed');
  }

  return policy;
};

/**
 * 安装接口返回成功后，仍要从当前 team source 读回插件。
 * plugin service 如果尚未按 source 写入，FastGPT 不能提前把团队账本标记为 installed。
 */
export const assertTeamPluginSourceReady = async ({
  teamId,
  tools
}: {
  teamId: string;
  tools: { pluginId: string; version?: string }[];
}) => {
  const systemToolRepo = SystemToolRepo.getInstance();

  await Promise.all(
    tools.map((tool) =>
      systemToolRepo.getSystemToolRuntime({
        pluginId: SystemToolCodec.getDBPluginId(getRawPluginIdFromSystemToolId(tool.pluginId)),
        version: tool.version,
        source: teamId
      })
    )
  ).catch(() => {
    return Promise.reject('plugin.team_source_install_failed');
  });
};

export const validateTeamPluginTagIds = async ({
  teamId,
  teamTagIds = []
}: {
  teamId: string;
  teamTagIds?: string[];
}) => {
  const uniqueTagIds = Array.from(new Set(teamTagIds));
  if (uniqueTagIds.length === 0) return [];

  const count = await MongoTeamPluginTag.countDocuments({
    teamId,
    tagId: { $in: uniqueTagIds }
  });
  if (count !== uniqueTagIds.length) {
    return Promise.reject('plugin.team_tag_not_found');
  }

  return uniqueTagIds;
};

export const upsertTeamInstalledPluginPolicy = async ({
  teamId,
  tmbId,
  pluginId,
  version,
  etag,
  installSource,
  teamTagIds,
  confirmedPermissions,
  packageSource
}: {
  teamId: string;
  tmbId: string;
  pluginId: string;
  version?: string;
  etag?: string;
  installSource: TeamPluginInstallSourceEnum;
  teamTagIds?: string[];
  confirmedPermissions?: string[];
  packageSource?: TeamInstalledPluginSchemaType['packageSource'];
}) => {
  const now = new Date();
  const validTeamTagIds = await validateTeamPluginTagIds({ teamId, teamTagIds });

  return MongoTeamInstalledPlugin.findOneAndUpdate(
    {
      teamId,
      pluginId,
      registrySource: TeamPluginRegistrySourceEnum.team
    },
    {
      $set: {
        teamId,
        pluginType: 'tool',
        pluginId,
        version,
        etag,
        registrySource: TeamPluginRegistrySourceEnum.team,
        installSource,
        status: TeamPluginPolicyStatusEnum.installed,
        hidden: false,
        installed: true,
        teamTagIds: validTeamTagIds,
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

export const setTeamSystemPluginHidden = async ({
  teamId,
  tmbId,
  pluginId,
  hidden
}: {
  teamId: string;
  tmbId: string;
  pluginId: string;
  hidden: boolean;
}) => {
  const now = new Date();

  return MongoTeamInstalledPlugin.findOneAndUpdate(
    {
      teamId,
      pluginId,
      registrySource: TeamPluginRegistrySourceEnum.system
    },
    {
      $set: {
        teamId,
        pluginType: 'tool',
        pluginId,
        registrySource: TeamPluginRegistrySourceEnum.system,
        status: hidden
          ? TeamPluginPolicyStatusEnum.hidden
          : TeamPluginPolicyStatusEnum.installed,
        hidden,
        installed: true,
        hiddenByTmbId: hidden ? tmbId : undefined,
        hiddenAt: hidden ? now : undefined,
        updatedByTmbId: tmbId,
        updatedAt: now,
        updateTime: now
      },
      $setOnInsert: {
        teamTagIds: [],
        confirmedPermissions: [],
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
    {
      teamId,
      pluginId,
      registrySource: TeamPluginRegistrySourceEnum.team
    },
    {
      $set: {
        status: TeamPluginPolicyStatusEnum.deleted,
        installed: false,
        hidden: false,
        deletedByTmbId: tmbId,
        deletedAt: now,
        updatedByTmbId: tmbId,
        updatedAt: now,
        updateTime: now
      },
      $setOnInsert: {
        teamId,
        pluginType: 'tool',
        pluginId,
        registrySource: TeamPluginRegistrySourceEnum.team,
        teamTagIds: [],
        confirmedPermissions: [],
        createTime: now
      }
    },
    {
      upsert: true,
      new: true
    }
  );
};

export const updateTeamPluginTags = async ({
  teamId,
  pluginId,
  registrySource,
  teamTagIds,
  tmbId
}: {
  teamId: string;
  pluginId: string;
  registrySource: TeamPluginRegistrySourceEnum;
  teamTagIds: string[];
  tmbId: string;
}) => {
  const validTeamTagIds = await validateTeamPluginTagIds({ teamId, teamTagIds });
  const now = new Date();

  const current = await getTeamPluginPolicy({ teamId, pluginId, registrySource });
  if (registrySource === TeamPluginRegistrySourceEnum.team && !current) {
    return Promise.reject('plugin.team_not_installed');
  }

  return MongoTeamInstalledPlugin.findOneAndUpdate(
    {
      teamId,
      pluginId,
      registrySource
    },
    {
      $set: {
        teamId,
        pluginType: 'tool',
        pluginId,
        registrySource,
        status:
          getTeamPluginPolicyStatus(current) ??
          (registrySource === TeamPluginRegistrySourceEnum.system
            ? TeamPluginPolicyStatusEnum.installed
            : TeamPluginPolicyStatusEnum.deleted),
        hidden: current?.hidden ?? false,
        installed: current?.installed ?? true,
        teamTagIds: validTeamTagIds,
        updatedByTmbId: tmbId,
        updatedAt: now,
        updateTime: now
      },
      $setOnInsert: {
        confirmedPermissions: [],
        createTime: now
      }
    },
    {
      upsert: registrySource === TeamPluginRegistrySourceEnum.system,
      new: true
    }
  );
};

export const listTeamPluginTags = (teamId: string) =>
  MongoTeamPluginTag.find({ teamId }).sort({ tagOrder: 1, createTime: 1 }).lean();

export const createTeamPluginTag = async ({
  teamId,
  tagName
}: {
  teamId: string;
  tagName: string;
}) => {
  const lastTag = await MongoTeamPluginTag.findOne({ teamId }).sort({ tagOrder: -1 }).lean();
  return MongoTeamPluginTag.create({
    teamId,
    tagId: getNanoid(12),
    tagName,
    tagOrder: (lastTag?.tagOrder ?? -1) + 1
  });
};

export const updateTeamPluginTag = ({
  teamId,
  tagId,
  tagName
}: {
  teamId: string;
  tagId: string;
  tagName: string;
}) =>
  MongoTeamPluginTag.findOneAndUpdate(
    { teamId, tagId },
    { $set: { tagName, updateTime: new Date() } },
    { new: true }
  );

export const updateTeamPluginTagOrder = async ({
  teamId,
  tagIds
}: {
  teamId: string;
  tagIds: string[];
}) => {
  await Promise.all(
    tagIds.map((tagId, index) =>
      MongoTeamPluginTag.updateOne({ teamId, tagId }, { $set: { tagOrder: index } })
    )
  );
};

export const deleteTeamPluginTag = async ({ teamId, tagId }: { teamId: string; tagId: string }) => {
  await MongoTeamPluginTag.deleteOne({ teamId, tagId });
  await MongoTeamInstalledPlugin.updateMany({ teamId }, { $pull: { teamTagIds: tagId } });
};

const getToolRegistrySource = ({ tool, teamId }: { tool: SystemToolListItemType; teamId: string }) => {
  if (isDebugToolSource(tool.source)) return undefined;
  return tool.source === teamId
    ? TeamPluginRegistrySourceEnum.team
    : TeamPluginRegistrySourceEnum.system;
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
  source: 'team',
  isToolSet: false,
  avatar: '',
  name: policy.pluginId,
  intro: '',
  author: '',
  tags: [],
  toolDescription: '',
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
  teamHidden: false,
  teamTagIds: policy.teamTagIds ?? [],
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
  const seenKeys = new Set<string>();
  const teamTagIdSet = new Set(filter.teamTagIds ?? []);

  const list = tools.flatMap<TeamPluginListItem>((tool) => {
    if (isDebugToolSource(tool.source)) {
      if (filter.includeDebug === false) return [];
      return [
        {
          ...tool,
          registrySource: TeamPluginRegistrySourceEnum.system,
          teamInstallStatus: 'system',
          teamHidden: false,
          teamTagIds: [],
          canManage
        }
      ];
    }

    const registrySource = getToolRegistrySource({ tool, teamId });
    if (!registrySource) return [];
    if (filter.source && filter.source !== 'all' && filter.source !== registrySource) return [];

    const pluginId = getRawPluginIdFromSystemToolId(tool.id);
    const key = policyKey({ registrySource, pluginId });
    const policy = policyMap.get(key);
    const status = getTeamPluginPolicyStatus(policy);
    const hidden = !!policy?.hidden || status === TeamPluginPolicyStatusEnum.hidden;
    seenKeys.add(key);

    if (registrySource === TeamPluginRegistrySourceEnum.system) {
      if (hidden && !filter.includeHidden) return [];
    } else {
      if (!policy && !filter.includeDeleted) return [];
      if (status === TeamPluginPolicyStatusEnum.deleted && !filter.includeDeleted) return [];
      if (status !== TeamPluginPolicyStatusEnum.installed && !filter.includeDeleted) return [];
    }

    const teamTagIds = policy?.teamTagIds ?? [];
    if (
      teamTagIdSet.size > 0 &&
      !teamTagIds.some((teamTagId) => teamTagIdSet.has(teamTagId))
    ) {
      return [];
    }

    return [
      {
        ...tool,
        status:
          registrySource === TeamPluginRegistrySourceEnum.team
            ? (normalizeTeamPluginStatus(tool.status) ?? PluginStatusEnum.Normal)
            : tool.status,
        source: registrySource === TeamPluginRegistrySourceEnum.team ? 'team' : tool.source,
        registrySource,
        installSource: policy?.installSource,
        teamInstallStatus:
          registrySource === TeamPluginRegistrySourceEnum.system
            ? hidden
              ? TeamPluginPolicyStatusEnum.hidden
              : 'system'
            : status ?? TeamPluginPolicyStatusEnum.deleted,
        teamHidden: hidden,
        teamTagIds,
        confirmedPermissions: policy?.confirmedPermissions,
        installedVersion: policy?.version,
        installedEtag: policy?.etag,
        canManage
      }
    ];
  });

  if (filter.includeDeleted) {
    policyMap.forEach((policy) => {
      const registrySource = policy.registrySource ?? TeamPluginRegistrySourceEnum.team;
      const status = getTeamPluginPolicyStatus(policy);
      const key = policyKey({ registrySource, pluginId: policy.pluginId });
      if (
        registrySource !== TeamPluginRegistrySourceEnum.team ||
        status !== TeamPluginPolicyStatusEnum.deleted ||
        seenKeys.has(key)
      ) {
        return;
      }

      list.push(buildDeletedToolPlaceholder({ policy, canManage }));
    });
  }

  return list;
};
