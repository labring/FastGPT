import { MongoDownloadCount } from '../mongo/models/download';
import type { pluginTypeEnum } from '../mongo/models/download';
import type z from 'zod';

const BATCH_INTERVAL = 10000; // 10 seconds

// Global cache storage for Next.js environment
declare global {
  var __downloadCache:
    | Array<{
        toolId: string;
        type: z.infer<typeof pluginTypeEnum>;
        hour: Date;
      }>
    | undefined;
  var __batchTimer: NodeJS.Timeout | undefined;
}

// Initialize global cache if not exists
if (!global.__downloadCache) {
  global.__downloadCache = [];
}

// Start batch timer
const startBatchTimer = () => {
  // Batch update to database
  const batchUpdate = async () => {
    if (global.__downloadCache!.length === 0) {
      return;
    }
    const batchMap = new Map<
      string,
      { toolId: string; type: string; hour: Date; downloadCount: number }
    >();
    global.__downloadCache!.forEach((record) => {
      const key = `${record.toolId}-${record.type}-${record.hour.getTime()}`;
      if (batchMap.has(key)) {
        batchMap.get(key)!.downloadCount++;
      } else {
        batchMap.set(key, {
          toolId: record.toolId,
          type: record.type,
          hour: record.hour,
          downloadCount: 1
        });
      }
    });

    const bulkOps = Array.from(batchMap.values()).map((record) => ({
      updateOne: {
        filter: {
          toolId: record.toolId,
          type: record.type,
          time: record.hour
        },
        update: {
          $inc: {
            downloadCount: record.downloadCount
          }
        },
        upsert: true
      }
    }));

    try {
      await MongoDownloadCount.bulkWrite(bulkOps);
      console.log(`Batch update download counts: ${bulkOps.length} items`);
    } catch (error) {
      console.error('Batch update download counts failed:', error);
    }

    // Clear cache
    global.__downloadCache = [];
    global.__batchTimer = undefined;
  };

  if (global.__batchTimer) {
    return;
  }

  global.__batchTimer = setTimeout(() => {
    batchUpdate();
  }, BATCH_INTERVAL);
};

// Get hour start time
const getHourStart = (date: Date = new Date()): Date => {
  const hourStart = new Date(date);
  hourStart.setMinutes(0, 0, 0);
  hourStart.setMilliseconds(0);
  return hourStart;
};

// Increase download count (with cache)
export const increaseDownloadCount = async (
  toolId: string,
  type: z.infer<typeof pluginTypeEnum>
) => {
  const hour = getHourStart();

  // Add to cache array
  global.__downloadCache!.push({
    toolId,
    type,
    hour
  });

  // Start timer (if not already started)
  startBatchTimer();
};

// Get download counts
export const getDownloadCounts = async () => {
  // Aggregate download counts by toolId directly in database
  const dbCounts = await MongoDownloadCount.aggregate([
    {
      $group: {
        _id: '$toolId',
        type: { $first: '$type' },
        downloadCount: { $sum: '$downloadCount' }
      }
    }
  ]);

  // Create result map with aggregated data
  const resultMap = new Map<string, { type: string; downloadCount: number }>();

  dbCounts.forEach((item) => {
    resultMap.set(item._id, {
      type: item.type,
      downloadCount: item.downloadCount
    });
  });

  return resultMap;
};
