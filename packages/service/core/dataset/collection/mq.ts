import { getWorker, QueueNames, getQueue, type Job } from '../../../common/bullmq';
import { MongoDatasetCollection } from './schema';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetTraining } from '../training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '../../../common/mongo';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

export type CollectionUpdateJobData = {
  teamId: string;
  datasetId: string;
  collectionId: string;
};

/**
 * Initialize Collection Update Worker
 * This worker handles collection updates (updateTime, etc.) with debounce mechanism
 */
export const initCollectionUpdateWorker = () => {
  const worker = getWorker<CollectionUpdateJobData>(
    QueueNames.collectionUpdate,
    async (job: Job<CollectionUpdateJobData>) => {
      const { collectionId } = job.data;

      try {
        const teamIdObj = new Types.ObjectId(job.data.teamId);
        const datasetIdObj = new Types.ObjectId(job.data.datasetId);
        const collectionIdObj = new Types.ObjectId(collectionId);

        // 1. Aggregate dataset_datas: count + processedCount
        // 2. Aggregate dataset_trainings: count + hasError + allParse
        // Run both in parallel since they query different collections
        const [[dataResult], [trainingResult]] = await Promise.all([
          MongoDatasetData.aggregate<{ count: number; processedCount: number } | undefined>([
            {
              $match: {
                teamId: teamIdObj,
                datasetId: datasetIdObj,
                collectionId: collectionIdObj
              }
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                processedCount: {
                  $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] }
                }
              }
            }
          ]),
          MongoDatasetTraining.aggregate<
            { count: number; hasError: boolean; allParse: boolean } | undefined
          >([
            {
              $match: {
                teamId: teamIdObj,
                datasetId: datasetIdObj,
                collectionId: collectionIdObj
              }
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                hasError: {
                  $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] }
                },
                allParse: {
                  $min: { $eq: ['$mode', TrainingModeEnum.parse] }
                }
              }
            }
          ])
        ]);

        const dataCount = dataResult?.count || 0;
        const processedCount = dataResult?.processedCount || 0;

        await MongoDatasetCollection.updateOne(
          {
            _id: collectionId
          },
          {
            $set: {
              dataAmount: dataCount,
              trainingAmount: trainingResult?.count || 0,
              processedCount: processedCount,
              remainingCount: dataCount - processedCount,
              hasError: trainingResult?.hasError || false,
              allParse: trainingResult ? trainingResult.allParse : true,
              statsUpdatedAt: new Date(),
              updateTime: new Date()
            }
          }
        );

        logger.debug('Collection stats updated', {
          collectionId,
          dataAmount: dataCount,
          trainingAmount: trainingResult?.count || 0
        });
      } catch (error) {
        logger.error('Failed to update collection', {
          collectionId,
          error
        });
        throw error;
      }
    },
    {
      concurrency: 3, // Process 3 jobs concurrently
      removeOnComplete: {
        count: 0 // Remove completed jobs immediately
      },
      removeOnFail: {
        count: 1000, // Keep last 1000 failed jobs
        age: 30 * 24 * 60 * 60 // Keep failed jobs for 30 days (in seconds)
      }
    }
  );

  logger.info('Collection Update worker initialized');

  // 存量数据回填（fire-and-forget，不阻塞 worker 返回）
  enqueueBackfillCollectionStatsJobs().catch((err) => {
    logger.error('Backfill collection stats failed', { error: err });
  });

  return worker;
};

/**
 * Push collection update job to queue with debounce
 * @param data - Job data containing teamId, datasetId, collectionId
 * @param delay - Delay in milliseconds (default: 5000ms = 5s). Pass 0 for backfill.
 */
export const pushCollectionUpdateJob = async (data: CollectionUpdateJobData, delay = 5000) => {
  const queue = getQueue<CollectionUpdateJobData>(QueueNames.collectionUpdate);

  // Use jobId to ensure only one job per collection (debounce mechanism)
  // If a job with the same jobId already exists, it will be replaced
  const jobId = `collection-update-${data.collectionId}`;

  try {
    await queue.add('updateCollection', data, {
      jobId, // Unique job ID for debounce
      delay,
      attempts: 3 // 限制重试 3 次，避免无限重试占用 worker 槽位
    });

    logger.debug('Collection update job pushed', {
      collectionId: data.collectionId,
      delay
    });
  } catch (error) {
    logger.error('Failed to push collection update job', {
      collectionId: data.collectionId,
      error
    });
  }
};

/**
 * Enqueue stats update jobs for all non-deleted, non-folder collections.
 * Use this to backfill stats for existing data after the stats fields are added.
 *
 * @param batchSize - Number of collections to process per batch (default 500)
 */
export const enqueueBackfillCollectionStatsJobs = async (batchSize = 500) => {
  let offset = 0;
  let enqueued = 0;

  while (true) {
    const collections = await MongoDatasetCollection.find(
      {
        deleteTime: null,
        type: { $ne: 'folder' },
        statsUpdatedAt: { $exists: false } // 只回填尚未初始化 stats 的 collection
      },
      { _id: 1, teamId: 1, datasetId: 1 }
    )
      .skip(offset)
      .limit(batchSize)
      .lean();

    if (collections.length === 0) break;

    for (const col of collections) {
      await pushCollectionUpdateJob(
        {
          collectionId: String(col._id),
          datasetId: String(col.datasetId),
          teamId: String(col.teamId)
        },
        0 // Skip debounce delay for backfill
      );
      enqueued++;
    }

    offset += batchSize;
    logger.info('Backfill collection stats progress', { enqueued, offset });

    // 批次间短暂等待，避免瞬间向 Redis 涌入大量 job
    if (collections.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  logger.info('Backfill collection stats complete', { totalEnqueued: enqueued });
  return { totalEnqueued: enqueued };
};
