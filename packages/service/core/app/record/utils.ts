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
    await MongoAppRecord.findOneAndUpdate(
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

    const records = await MongoAppRecord.find(
      { tmbId },
      { _id: 1 },
      {
        session,
        sort: { lastUsedTime: -1 },
        lean: true
      }
    );

    if (records.length > 50) {
      const toDeleteRecords = records.slice(50);
      const toDeleteIds = toDeleteRecords.map((record) => record._id);

      await MongoAppRecord.deleteMany(
        {
          tmbId,
          _id: { $in: toDeleteIds }
        },
        { session }
      );
    }
  });
};
