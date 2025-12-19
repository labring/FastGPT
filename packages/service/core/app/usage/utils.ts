import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoAppUsage } from './schema';

export const recordAppUsage = async ({
  appId,
  tmbId,
  teamId
}: {
  appId: string;
  tmbId: string;
  teamId: string;
}) => {
  await mongoSessionRun(async (session) => {
    await MongoAppUsage.findOneAndUpdate(
      { tmbId, appId },
      {
        $set: {
          teamId,
          lastUsedTime: new Date()
        }
      },
      {
        upsert: true,
        new: true,
        session
      }
    );

    // 保留最新的50条记录，删除超出限制的旧记录
    const threshold = await MongoAppUsage.findOne(
      { tmbId },
      { lastUsedTime: 1 },
      {
        session,
        sort: { lastUsedTime: -1 },
        skip: 49,
        lean: true
      }
    );

    if (threshold) {
      await MongoAppUsage.deleteMany(
        {
          tmbId,
          _id: { $ne: threshold._id },
          lastUsedTime: { $lte: threshold.lastUsedTime }
        },
        { session }
      );
    }
  });
};
