import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoAppRecord } from './schema';

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
    await MongoAppRecord.updateOne(
      { tmbId, appId },
      {
        $set: {
          teamId,
          lastUsedTime: new Date()
        }
      },
      {
        upsert: true,
        session
      }
    );

    // 检查是否超过50条，如果超过则删除最旧的一条
    const count = await MongoAppRecord.countDocuments({ tmbId }, { session });

    if (count > 50) {
      await MongoAppRecord.deleteOne(
        { tmbId },
        {
          session,
          sort: { lastUsedTime: 1 }
        }
      );
    }
  });
};
