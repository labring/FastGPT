import { MongoDownloadCount } from '../mongo/models/download';
import type { pluginTypeEnum } from '../mongo/models/download';
import type z from 'zod';

export const increaseDownloadCount = async (
  toolId: string,
  type: z.infer<typeof pluginTypeEnum>
) => {
  await MongoDownloadCount.updateOne(
    {
      toolId,
      type
    },
    {
      $inc: {
        downloadCount: 1
      }
    },
    {
      upsert: true
    }
  );
};

export const getDownloadCounts = async () => {
  const counts = await MongoDownloadCount.find({}).lean();
  return new Map(
    counts.map((item) => [
      item.toolId,
      {
        type: item.type,
        downloadCount: item.downloadCount
      }
    ])
  );
};
