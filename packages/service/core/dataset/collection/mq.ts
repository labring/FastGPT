import type { Job } from '@fastgpt/dal/redis/bullmq';
import { MongoDatasetCollection } from './schema';
import { getLogger, LogCategories } from '../../../common/logger';
import { collectionUpdateMQService, type CollectionUpdateJobData } from '@fastgpt/dal/redis/bullmq';

export type { CollectionUpdateJobData } from '@fastgpt/dal/redis/bullmq';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

/**
 * Initialize Collection Update Worker
 * This worker handles collection updates (updateTime, etc.) with debounce mechanism
 */
export const initCollectionUpdateWorker = () => {
  const worker = collectionUpdateMQService.getWorker(async (job: Job<CollectionUpdateJobData>) => {
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
  });

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
export const pushCollectionUpdateJob = (data: CollectionUpdateJobData) =>
  collectionUpdateMQService.pushJob(data);
