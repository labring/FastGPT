import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus/index';
import { milvusVersionManager } from '@fastgpt/service/common/vectorDB/milvus/version';
import { DatasetVectorTableName } from '@fastgpt/service/common/vectorDB/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { activeTrainingMatch } from '@fastgpt/service/core/dataset/training/query';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getLogger } from '@fastgpt/service/common/logger';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { customNanoid } from '@fastgpt/global/common/string/tools';

const logger = getLogger(['initv4152']);

export type Initv4152Query = {
  dryRun?: string;
};

export type Initv4152Response = {
  success: boolean;
  message: string;
  stats: {
    totalDatasets: number;
    totalDataCount: number;
    estimatedMinutes: number;
  };
  failedCollections?: { collectionName: string; error: string }[];
};

const parseDryRun = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const targetCollections = [DatasetVectorTableName];

async function handler(
  req: ApiRequestProps<object, Initv4152Query>,
  _res: ApiResponseType<Initv4152Response>
): Promise<Initv4152Response> {
  const dryRun = parseDryRun(req.query?.dryRun);

  await authCert({ req, authRoot: true });

  const milvus = new MilvusCtrl();
  let client: Awaited<ReturnType<typeof milvus.getClient>>;
  try {
    client = await milvus.getClient();
  } catch (_err) {
    return {
      success: false,
      message: 'Milvus is not configured or client initialization failed.',
      stats: { totalDatasets: 0, totalDataCount: 0, estimatedMinutes: 0 }
    };
  }

  await milvusVersionManager.resetDetection(client);

  if (!milvusVersionManager.supportsFullText()) {
    return {
      success: false,
      message: `Milvus version is ${milvusVersionManager.getFeatureLevel()}, requires v2.6+`,
      stats: { totalDatasets: 0, totalDataCount: 0, estimatedMinutes: 0 }
    };
  }

  const activeTrainingCount = await MongoDatasetTraining.countDocuments(activeTrainingMatch);
  if (activeTrainingCount > 0) {
    return {
      success: false,
      message: `Active training tasks detected (${activeTrainingCount}). Please wait for completion.`,
      stats: { totalDatasets: 0, totalDataCount: 0, estimatedMinutes: 0 }
    };
  }

  const [datasets, totalDataCount] = await Promise.all([
    MongoDataset.find({}, '_id teamId tmbId vectorModel agentModel vlmModel').lean(),
    MongoDatasetData.countDocuments({})
  ]);
  const totalDatasets = datasets.length;
  const estimatedMinutes = Math.max(1, Math.ceil(totalDataCount / 500));

  const stats = {
    totalDatasets,
    totalDataCount,
    estimatedMinutes
  };

  if (dryRun) {
    logger.info('[initv4152] Dry run completed', stats);
    return {
      success: true,
      message: 'Dry run completed. No changes made.',
      stats
    };
  }

  // Rebuild collections
  const failedCollections: { collectionName: string; error: string }[] = [];

  for (const collectionName of targetCollections) {
    try {
      logger.info('[initv4152] Dropping collection', { collectionName });
      await client.dropCollection({ collection_name: collectionName });
    } catch (err) {
      logger.warn('[initv4152] Drop collection skipped or failed', {
        collectionName,
        error: err instanceof Error ? err.message : String(err)
      });
    }

    try {
      logger.info('[initv4152] Creating collection', { collectionName });
      await milvus.init();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('[initv4152] Create collection failed', { collectionName, error });
      failedCollections.push({ collectionName, error });
      continue;
    }
  }

  if (failedCollections.length > 0) {
    return {
      success: false,
      message: `Migration completed with errors: failed to recreate ${failedCollections.length} collection(s).`,
      stats,
      failedCollections
    };
  }

  // Mark all data as rebuilding. This serves as a progress cursor — if the
  // migration crashes partway through, retry only picks up remaining
  // { rebuilding: true } records. (References rebuildEmbedding.ts pattern.)
  await MongoDatasetData.updateMany({}, { $set: { rebuilding: true } });
  logger.info('[initv4152] Marked all data rebuilding');

  // Enqueue historical data for rebuilding
  const billId = `initv4152-${Date.now()}-${customNanoid('1234567890abcdefghijklmnopqrstuvwxyz', 6)}`;
  const batchSize = 200;
  let enqueuedCount = 0;
  let failedEnqueueCount = 0;

  while (true) {
    const dataList = await MongoDatasetData.find(
      { rebuilding: true },
      '_id teamId tmbId datasetId collectionId q a imageId indexes chunkIndex'
    )
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (dataList.length === 0) break;

    const batchIds = dataList.map((d) => d._id);
    const now = new Date();

    const tasks = dataList.map((data) => ({
      teamId: data.teamId,
      tmbId: data.tmbId,
      datasetId: data.datasetId,
      collectionId: data.collectionId,
      billId,
      mode: TrainingModeEnum.chunk,
      dataId: data._id,
      q: data.q || '',
      a: data.a || '',
      ...(data.imageId && { imageId: data.imageId }),
      chunkIndex: data.chunkIndex ?? 0,
      indexes: (data.indexes || []).map((idx) => ({
        type: idx.type,
        text: idx.text
      })),
      retryCount: 50
    }));

    try {
      await mongoSessionRun(async (session) => {
        // Atomically unset rebuilding + clear stale indexes so
        // mergeExistingSystemIndexIds cannot match old dataIds.
        await MongoDatasetData.updateMany(
          { _id: { $in: batchIds } },
          { $unset: { rebuilding: null }, $set: { indexes: [], updateTime: now } },
          { session }
        );

        await MongoDatasetTraining.insertMany(tasks, {
          session,
          ordered: false
        });
      });
      enqueuedCount += tasks.length;
    } catch (err) {
      failedEnqueueCount += tasks.length;
      logger.error('[initv4152] Failed to enqueue training tasks', {
        error: err instanceof Error ? err.message : String(err),
        batchSize: tasks.length
      });
    }
  }

  logger.info('[initv4152] Migration triggered', {
    ...stats,
    enqueuedCount,
    failedEnqueueCount
  });

  return {
    success: true,
    message: `Migration started. Processing ${totalDataCount} records from ${totalDatasets} datasets. Estimated time: ${estimatedMinutes} minutes.`,
    stats
  };
}

export default NextAPI(handler);
