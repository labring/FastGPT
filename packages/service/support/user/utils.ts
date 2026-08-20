import { type SourceMemberType } from '@fastgpt/global/support/user/type';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { teamRepository } from '../../common/dal';

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

  const lastExportDatasetTime = team?.limit?.lastExportDatasetTime;
  if (!team || (lastExportDatasetTime && lastExportDatasetTime > limitMinutesAgo)) {
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

/**
 * 清除团队站点同步冷却时间。
 *
 * 站点同步任务入队时会先写入 `limit.lastWebsiteSyncTime` 做触发频率限制；
 * 如果 worker 最终没有成功同步任何页面，这次空同步不应占用团队后续手动同步机会。
 */
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

  const lastWebsiteSyncTime = team?.limit?.lastWebsiteSyncTime;
  if (!team || (lastWebsiteSyncTime && lastWebsiteSyncTime > limitMinutesAgo)) {
    return Promise.reject(`每个团队，每 ${limitMinutes} 分钟仅使用一次同步功能。`);
  }
};

/**
 * This function will add a property named sourceMember to the list passed in.
 * @param list The list to add the sourceMember property to. [TmbId] property is required.
 * @error If member is not found, this item will be skipped.
 * @returns The list with the sourceMember property added.
 */
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

  const result: Array<T & { sourceMember: SourceMemberType }> = [];
  for (const item of list) {
    const tmb = tmbList.find((member) => member.id === String(item.tmbId));
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
