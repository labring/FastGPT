import { addLog } from '../../common/system/log';
import { setCron } from '../../common/system/cron';
import { initEvalDatasetDataQualityWorker } from './dataset/dataQualityProcessor';
import { initEvalDatasetDataSynthesizeWorker } from './dataset/dataSynthesizeProcessor';
import { initEvalTaskItemWorker } from './task/processor';
import { initEvaluationSummaryWorker } from './summary/worker';

// Import all queues for cleanup
import { evaluationItemQueue } from './task/mq';
import { evalDatasetDataQualityQueue } from './dataset/dataQualityMq';
import { evalDatasetDataSynthesizeQueue } from './dataset/dataSynthesizeMq';
import { getEvaluationSummaryQueue } from './summary/queue';

// Import MongoDB models for existence checks
import { MongoEvaluation, MongoEvalItem } from './task/schema';
import { MongoEvalDatasetData } from './dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from './dataset/evalDatasetCollectionSchema';

// Initialize evaluation workers

export const initEvaluationWorkers = () => {
  addLog.info('Init Evaluation Workers...');

  initEvalTaskItemWorker();

  initEvalDatasetDataQualityWorker();
  initEvalDatasetDataSynthesizeWorker();

  initEvaluationSummaryWorker();

  // Setup periodic orphaned jobs cleanup
  setupOrphanedJobsCleanup();
};

/**
 * Setup periodic cleanup for orphaned jobs
 * Specifically handles residual issues caused by active jobs that cannot be deleted
 */
const setupOrphanedJobsCleanup = () => {
  // Run cleanup every 30 minutes
  setCron('*/30 * * * *', async () => {
    await cleanupOrphanedJobs();
  });

  addLog.info('[Evaluation] Orphaned jobs cleanup scheduled (every 30 minutes)');
};

/**
 * Comprehensive cleanup for all orphaned jobs in evaluation system
 * Handles active jobs that cannot be deleted by BullMQ
 */
export const cleanupOrphanedJobs = async () => {
  try {
    addLog.debug('[Evaluation] Starting comprehensive orphaned jobs cleanup');

    const summaryQueue = getEvaluationSummaryQueue();

    // Get all jobs from all evaluation queues
    const [itemJobs, dataQualityJobs, dataSynthesizeJobs, summaryJobs] = await Promise.all([
      evaluationItemQueue.getJobs(['active', 'waiting', 'delayed', 'completed', 'failed'], 0, 2000),
      evalDatasetDataQualityQueue.getJobs(
        ['active', 'waiting', 'delayed', 'completed', 'failed'],
        0,
        1000
      ),
      evalDatasetDataSynthesizeQueue.getJobs(
        ['active', 'waiting', 'delayed', 'completed', 'failed'],
        0,
        1000
      ),
      summaryQueue.getJobs(['active', 'waiting', 'delayed', 'completed', 'failed'], 0, 500)
    ]);

    let cleanedCount = 0;
    let skippedActiveCount = 0;

    // 1. Clean orphaned eval task item jobs
    for (const job of itemJobs) {
      try {
        const { evalId, evalItemId } = job.data;
        const [evaluation, evalItem] = await Promise.all([
          MongoEvaluation.exists({ _id: evalId }),
          MongoEvalItem.exists({ _id: evalItemId })
        ]);

        if (!evaluation || !evalItem) {
          const result = await cleanupJob(job, 'item', { evalId, evalItemId });
          if (result.cleaned) cleanedCount++;
          if (result.skippedActive) skippedActiveCount++;
        }
      } catch (error) {
        addLog.warn('[Evaluation] Failed to cleanup item job', { jobId: job.id, error });
      }
    }

    // 2. Clean orphaned data quality jobs
    for (const job of dataQualityJobs) {
      try {
        const { dataId } = job.data;
        const dataExists = await MongoEvalDatasetData.exists({ _id: dataId });

        if (!dataExists) {
          const result = await cleanupJob(job, 'dataQuality', { dataId });
          if (result.cleaned) cleanedCount++;
          if (result.skippedActive) skippedActiveCount++;
        }
      } catch (error) {
        addLog.warn('[Evaluation] Failed to cleanup data quality job', { jobId: job.id, error });
      }
    }

    // 3. Clean orphaned data synthesize jobs
    for (const job of dataSynthesizeJobs) {
      try {
        const { evalDatasetCollectionId } = job.data;
        const collectionExists = await MongoEvalDatasetCollection.exists({
          _id: evalDatasetCollectionId
        });

        if (!collectionExists) {
          const result = await cleanupJob(job, 'dataSynthesize', {
            evalDatasetCollectionId
          });
          if (result.cleaned) cleanedCount++;
          if (result.skippedActive) skippedActiveCount++;
        }
      } catch (error) {
        addLog.warn('[Evaluation] Failed to cleanup data synthesize job', { jobId: job.id, error });
      }
    }

    // 4. Clean orphaned summary jobs
    for (const job of summaryJobs) {
      try {
        const { evalId } = job.data;
        const evaluation = await MongoEvaluation.exists({ _id: evalId });

        if (!evaluation) {
          const result = await cleanupJob(job, 'summary', { evalId });
          if (result.cleaned) cleanedCount++;
          if (result.skippedActive) skippedActiveCount++;
        }
      } catch (error) {
        addLog.warn('[Evaluation] Failed to cleanup summary job', { jobId: job.id, error });
      }
    }

    const result = {
      totalJobs:
        itemJobs.length + dataQualityJobs.length + dataSynthesizeJobs.length + summaryJobs.length,
      cleanedJobs: cleanedCount,
      skippedActiveJobs: skippedActiveCount,
      breakdown: {
        itemJobs: itemJobs.length,
        dataQualityJobs: dataQualityJobs.length,
        dataSynthesizeJobs: dataSynthesizeJobs.length,
        summaryJobs: summaryJobs.length
      }
    };

    addLog.info('[Evaluation] Comprehensive orphaned jobs cleanup completed', result);
    return result;
  } catch (error) {
    addLog.error('[Evaluation] Comprehensive orphaned jobs cleanup failed', { error });
    return null;
  }
};

/**
 * Helper function to cleanup individual job
 */
async function cleanupJob(job: any, jobType: string, context: Record<string, any>) {
  const jobState = await job.getState();

  if (jobState === 'active') {
    // Active job cannot be removed, log warning
    addLog.warn(`[Evaluation] Found orphaned active ${jobType} job (cannot remove)`, {
      jobId: job.id,
      state: jobState,
      ...context
    });
    return { cleaned: false, skippedActive: true };
  } else {
    // Non-active jobs can be safely removed
    await job.remove();
    addLog.debug(`[Evaluation] Removed orphaned ${jobType} job`, {
      jobId: job.id,
      state: jobState,
      ...context
    });
    return { cleaned: true, skippedActive: false };
  }
}
