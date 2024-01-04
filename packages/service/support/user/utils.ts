import { MongoTeam } from './team/teamSchema';

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
