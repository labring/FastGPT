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

if (!global.__batchTimer) {
  global.__batchTimer = undefined;
}

// Get hour start time
const getHourStart = (date: Date = new Date()): Date => {
  const hourStart = new Date(date);
  hourStart.setMinutes(0, 0, 0);
  hourStart.setMilliseconds(0);
  return hourStart;
};

// Batch update to database
const batchUpdate = async () => {
  if (global.__downloadCache!.length === 0) {
    return;
  }

  const bulkOps = global.__downloadCache!.map((record) => ({
    updateOne: {
      filter: {
        toolId: record.toolId,
        type: record.type,
        time: record.hour
      },
      update: {
        $inc: {
          downloadCount: 1
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
};

// Start batch timer
const startBatchTimer = () => {
  if (global.__batchTimer) {
    return;
  }

  global.__batchTimer = setInterval(() => {
    batchUpdate();
  }, BATCH_INTERVAL);
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
  // Get data from database first
  const dbCounts = await MongoDownloadCount.find({}).lean();

  // Create result map with database data
  const resultMap = new Map<string, { type: string; downloadCount: number }>();

  // Add database data
  dbCounts.forEach((item) => {
    resultMap.set(item.toolId, {
      type: item.type,
      downloadCount: item.downloadCount
    });
  });

  // Add cache data
  global.__downloadCache!.forEach((record) => {
    const existing = resultMap.get(record.toolId);
    if (existing) {
      existing.downloadCount++;
    } else {
      resultMap.set(record.toolId, {
        type: record.type,
        downloadCount: 1
      });
    }
  });

  return resultMap;
};

// Get total download count for specific tool
export const getToolDownloadCount = async (toolId: string) => {
  const counts = await getDownloadCounts();
  const toolCount = counts.get(toolId);
  return toolCount?.downloadCount || 0;
};
