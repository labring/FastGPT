import { type SourceMemberType } from '@fastgpt/global/support/user/type';
import { MongoTeam } from './team/teamSchema';
import { MongoTeamMember } from './team/teamMemberSchema';
import { type ClientSession } from '../../common/mongo';

/* export dataset limit */
export const updateExportDatasetLimit = async (teamId: string) => {
  try {
    await MongoTeam.findByIdAndUpdate(teamId, {
      'limit.lastExportDatasetTime': new Date()
    });
  } catch (error) {}
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
  } catch (error) {}
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
 * @error If member is not found, this item will be skipped.
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
    .filter(Boolean);
  const tmbList = await MongoTeamMember.find(
    {
      _id: { $in: tmbIdList }
    },
    'tmbId name avatar status',
    {
      session
    }
  ).lean();

  return list
    .map((item) => {
      const tmb = tmbList.find((tmb) => String(tmb._id) === String(item.tmbId));
      if (!tmb) return;

      // @ts-ignore
      const formatItem = typeof item.toObject === 'function' ? item.toObject() : item;

      return {
        ...formatItem,
        sourceMember: { name: tmb.name, avatar: tmb.avatar, status: tmb.status }
      };
    })
    .filter(Boolean) as Array<T & { sourceMember: SourceMemberType }>;
}
