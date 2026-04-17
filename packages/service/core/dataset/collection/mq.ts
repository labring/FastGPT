import { getWorker, QueueNames, getQueue, type Job } from '../../../common/bullmq';
import { MongoDatasetCollection } from './schema';
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
        // Update collection updateTime and other operations
        await MongoDatasetCollection.updateOne(
          {
            _id: collectionId
          },
          {
            $set: {
              updateTime: new Date()
              // TODO: 更新统计数据
            }
          }
        );

        logger.debug('Collection updated', {
          collectionId
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
  return worker;
};

/**
 * Push collection update job to queue with debounce
 * @param collectionId - Collection ID
 * @param datasetId - Dataset ID
 * @param teamId - Team ID
 * @param delay - Delay in milliseconds (default: 5000ms = 5s)
 */
export const pushCollectionUpdateJob = async (data: CollectionUpdateJobData) => {
  const queue = getQueue<CollectionUpdateJobData>(QueueNames.collectionUpdate);

  // Use jobId to ensure only one job per collection (debounce mechanism)
  // If a job with the same jobId already exists, it will be replaced
  const jobId = `collection-update-${data.collectionId}`;

  try {
    await queue.add('updateCollection', data, {
      jobId, // Unique job ID for debounce
      delay: 5000 // Delay execution by 5 seconds
    });

    logger.debug('Collection update job pushed', {
      collectionId: data.collectionId
    });
  } catch (error) {
    logger.error('Failed to push collection update job', {
      collectionId: data.collectionId,
      error
    });
  }
};
