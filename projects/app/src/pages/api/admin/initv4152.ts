import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus/index';
import { milvusVersionManager } from '@fastgpt/service/common/vectorDB/milvus/version';
import { isCollectionNotFoundError } from '@fastgpt/service/common/vectorDB/milvus/config';
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
  const collectionName = DatasetVectorTableName;

  // Step 1: drop existing collection
  try {
    logger.info('[initv4152] Dropping collection', { collectionName });
    const dropResult = await client.dropCollection({ collection_name: collectionName });
    // dropCollection resolves (doesn't throw) for server-side errors like
    // CollectionNotExists — check the returned status, not just the catch block.
    const dropCode = dropResult?.error_code;
    if (
      dropCode !== undefined &&
      dropCode !== 'Success' &&
      dropCode !== 0 &&
      !isCollectionNotFoundError({ error_code: dropCode })
    ) {
      const error = `Drop collection failed: ${dropCode} - ${dropResult?.reason || 'unknown'}`;
      logger.error('[initv4152] Drop collection failed', {
        collectionName,
        dropCode,
        reason: dropResult?.reason
      });
      failedCollections.push({ collectionName, error });
    }
  } catch (err) {
    // Transport-level errors (network, auth) are thrown — only ignore NotFound.
    if (isCollectionNotFoundError(err)) {
      logger.info('[initv4152] Collection does not exist, skipping drop', { collectionName });
    } else {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('[initv4152] Drop collection failed', { collectionName, error });
      failedCollections.push({ collectionName, error });
    }
  }

  // Step 2: recreate collection with BM25 schema
  if (failedCollections.length === 0) {
    try {
      logger.info('[initv4152] Creating collection', { collectionName });
      await milvus.init();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('[initv4152] Create collection failed', { collectionName, error });
      failedCollections.push({ collectionName, error });
    }
  }

  // Step 3: validate the recreated collection has the expected BM25 schema fields.
  // If dropCollection failed silently (e.g. wrong database) and init reused
  // an existing non-BM25 collection, catch it here before data migration.
  if (failedCollections.length === 0) {
    try {
      const desc = await client.describeCollection({ collection_name: collectionName });
      const fieldNames: string[] = (desc?.schema?.fields ?? []).map((f: any) => f?.name);
      if (!fieldNames.includes('text') || !fieldNames.includes('sparse')) {
        const missing = [];
        if (!fieldNames.includes('text')) missing.push('text');
        if (!fieldNames.includes('sparse')) missing.push('sparse');
        const msg = `Collection recreated but missing BM25 field(s): ${missing.join(', ')}. Fields: ${fieldNames.join(', ')}`;
        logger.error('[initv4152] Schema validation failed', {
          collectionName,
          fields: fieldNames
        });
        failedCollections.push({ collectionName, error: msg });
      } else {
        logger.info('[initv4152] Schema validated', { collectionName, fieldNames });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('[initv4152] Schema validation failed', { collectionName, error });
      failedCollections.push({ collectionName, error });
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

  // Enqueue initial batch of training tasks. Each task claims one record
  // atomically via findOneAndUpdate. Workers chain further records by
  // picking up the next rebuilding:true record on task completion.
  // (References rebuildEmbedding.ts pattern.)
  const billId = `initv4152-${Date.now()}-${customNanoid('1234567890abcdefghijklmnopqrstuvwxyz', 6)}`;
  const max = global.systemEnv?.vectorMaxProcess || 10;
  const arr = new Array(max * 2).fill(0);

  for (let i = 0; i < arr.length; i++) {
    try {
      const hasNext = await mongoSessionRun(async (session) => {
        // Atomically claim one record.
        const data = await MongoDatasetData.findOneAndUpdate(
          { rebuilding: true },
          { $unset: { rebuilding: '' }, $set: { updateTime: new Date() } },
          { session }
        )
          .select('_id teamId tmbId datasetId collectionId q a imageId chunkIndex')
          .lean();

        if (!data) return false;

        await MongoDatasetTraining.create(
          [
            {
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
              retryCount: 50
            }
          ],
          { session, ordered: true }
        );

        return true;
      });

      if (!hasNext) break;
    } catch {}
  }

  logger.info('[initv4152] Migration triggered', stats);

  return {
    success: true,
    message: `Migration started. Processing ${totalDataCount} records from ${totalDatasets} datasets. Estimated time: ${estimatedMinutes} minutes.`,
    stats
  };
}

export default NextAPI(handler);
