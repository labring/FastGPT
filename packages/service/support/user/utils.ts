import { type SourceMemberType } from '@fastgpt/global/support/user/type';
import { MongoTeam } from './team/teamSchema';
import { getTeamMemberMap } from './team/utils';
import { type ClientSession } from '../../common/mongo';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

/* export dataset limit */
export const updateExportDatasetLimit = async (teamId: string) => {
  try {
    await MongoTeam.findByIdAndUpdate(teamId, {
      'limit.lastExportDatasetTime': new Date()
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

  // auth export times
  const authTimes = await MongoTeam.findOne(
    {
      _id: teamId,
      $or: [
        { 'limit.lastExportDatasetTime': { $exists: false } },
        { 'limit.lastExportDatasetTime': { $lte: limitMinutesAgo } }
      ]
    },
    '_id limit'
  );

  if (!authTimes) {
    return Promise.reject(`每个团队，每 ${limitMinutes} 分钟仅可导出一次。`);
  }
};

/* web sync limit */
export const updateWebSyncLimit = async (teamId: string) => {
  try {
    await MongoTeam.findByIdAndUpdate(teamId, {
      'limit.lastWebsiteSyncTime': new Date()
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
    await MongoTeam.findByIdAndUpdate(teamId, {
      $unset: {
        'limit.lastWebsiteSyncTime': 1
      }
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

  // auth export times
  const authTimes = await MongoTeam.findOne(
    {
      _id: teamId,
      $or: [
        { 'limit.lastWebsiteSyncTime': { $exists: false } },
        { 'limit.lastWebsiteSyncTime': { $lte: limitMinutesAgo } }
      ]
    },
    '_id limit'
  );

  if (!authTimes) {
    return Promise.reject(`每个团队，每 ${limitMinutes} 分钟仅使用一次同步功能。`);
  }
};

/**
 * This function will add a property named sourceMember to the list passed in.
 * @param list The list to add the sourceMember property to. [TmbId] property is required.
 * If member is not found, fallback unknown member info with leave status is used to preserve list length for pagination.
 * @returns The list with the sourceMember property added.
 */
export async function addSourceMember<T extends { tmbId: string }>({
  list,
  session
}: {
  list: T[];
  session?: ClientSession;
}): Promise<Array<T & { sourceMember: SourceMemberType }>> {
  if (!Array.isArray(list)) return [];

  const tmbIdList = list
    .map((item) => (item.tmbId ? String(item.tmbId) : undefined))
    .filter((tmbId): tmbId is string => tmbId !== undefined);
  const tmbMap = await getTeamMemberMap({
    memberIds: tmbIdList,
    fields: '_id name avatar status',
    session
  });

  const hasToObject = <R>(doc: unknown): doc is { toObject: () => R } =>
    typeof doc === 'object' &&
    doc !== null &&
    'toObject' in doc &&
    typeof (doc as Record<string, unknown>).toObject === 'function';

  const defaultLeaveMember = {
    name: 'undefined',
    avatar: '',
    status: TeamMemberStatusEnum.leave
  };

  return list.map((item) => {
    const tmb = tmbMap.get(String(item.tmbId)) ?? defaultLeaveMember;
    const formatItem = hasToObject<T>(item) ? item.toObject() : item;

    return {
      ...formatItem,
      sourceMember: formatSourceMember(tmb)
    };
  }) as Array<T & { sourceMember: SourceMemberType }>;
}

export const formatSourceMember = (member: {
  name?: string | null;
  avatar?: string | null;
  status?: TeamMemberStatusEnum | null;
}): SourceMemberType => ({
  name: member.name?.trim() ? member.name : 'unknown',
  avatar: member.avatar,
  status: member.status ?? TeamMemberStatusEnum.active
});
