import { type SourceMemberType } from '@fastgpt/global/support/user/type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { teamRepository } from '../../../common/dal';

/** 返回运行时用户信息，DAL 负责成员、用户和团队的关联查询。 */
export async function getRunningUserInfoByTmbId(tmbId: string) {
  if (!tmbId) return Promise.reject(TeamErrEnum.notUser);

  const relations = await teamRepository.findMemberRelationsById(tmbId);
  if (!relations?.team || !relations.user) return Promise.reject(TeamErrEnum.notUser);

  return {
    username: relations.user.username,
    teamName: relations.team.name,
    memberName: relations.member.name,
    contact: relations.user.contact ?? '',
    teamId: relations.member.teamId,
    tmbId: relations.member.id
  };
}

/** 返回工作流运行时需要的时区和第三方模型配置。 */
export async function getUserChatInfo(tmbId: string) {
  const relations = await teamRepository.findMemberRelationsById(tmbId);
  if (!relations?.team || !relations.user) return Promise.reject(TeamErrEnum.notUser);
  const openaiAccount =
    relations.team.openaiAccount?.key && relations.team.openaiAccount.baseUrl
      ? relations.team.openaiAccount
      : undefined;

  return {
    timezone: relations.user.timezone ?? 'Asia/Shanghai',
    externalProvider: {
      openaiAccount,
      externalWorkflowVariables: relations.team.externalWorkflowVariables
    }
  };
}

/* export dataset limit */
export const updateExportDatasetLimit = async (teamId: string) => {
  try {
    await teamRepository.updateTeamLimit(teamId, {
      lastExportDatasetTime: new Date()
    });
  } catch {}
};

export const checkExportDatasetLimit = async ({
  teamId,
  limitMinutes = 0
}: {
  teamId: string;
  limitMinutes?: number;
}) => {
  const limitMinutesAgo = new Date(Date.now() - limitMinutes * 60 * 1000);
  const team = await teamRepository.findTeamById(teamId);
  if (team?.limit?.lastExportDatasetTime && team.limit.lastExportDatasetTime > limitMinutesAgo) {
    return Promise.reject(`每个团队，每 ${limitMinutes} 分钟仅可导出一次。`);
  }
};

/* web sync limit */
export const updateWebSyncLimit = async (teamId: string) => {
  try {
    await teamRepository.updateTeamLimit(teamId, {
      lastWebsiteSyncTime: new Date()
    });
  } catch {}
};

/** 清除站点同步冷却时间，空同步不应占用后续手动同步机会。 */
export const clearWebSyncLimit = async (teamId: string) => {
  try {
    await teamRepository.updateTeamLimit(teamId, {
      lastWebsiteSyncTime: null
    });
  } catch {}
};

export const checkWebSyncLimit = async ({
  teamId,
  limitMinutes = 0
}: {
  teamId: string;
  limitMinutes?: number;
}) => {
  const limitMinutesAgo = new Date(Date.now() - limitMinutes * 60 * 1000);
  const team = await teamRepository.findTeamById(teamId);
  if (team?.limit?.lastWebsiteSyncTime && team.limit.lastWebsiteSyncTime > limitMinutesAgo) {
    return Promise.reject(`每个团队，每 ${limitMinutes} 分钟仅使用一次同步功能。`);
  }
};

/** 为列表补充成员信息；找不到成员的条目沿用旧逻辑直接跳过。 */
export async function addSourceMember<T extends { tmbId: string }>({
  list
}: {
  list: T[];
}): Promise<Array<T & { sourceMember: SourceMemberType }>> {
  if (!Array.isArray(list)) return [];

  const tmbIdList = list
    .map((item) => (item.tmbId ? String(item.tmbId) : undefined))
    .filter((id): id is string => Boolean(id));
  const tmbList = await teamRepository.findMembersByIds(tmbIdList);
  const tmbMap = new Map(tmbList.map((tmb) => [tmb.id, tmb]));

  const result: Array<T & { sourceMember: SourceMemberType }> = [];
  for (const item of list) {
    const tmb = tmbMap.get(String(item.tmbId));
    if (!tmb) continue;

    result.push({
      ...item,
      sourceMember: {
        name: tmb.name,
        avatar: tmb.avatar ?? '',
        status: (tmb.status ?? TeamMemberStatusEnum.active) as TeamMemberStatusEnum
      }
    });
  }
  return result;
}
