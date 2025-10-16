import { getQueue } from '../../../common/bullmq';
import { QueueNames } from '../../../common/bullmq';
import { addLog } from '../../../common/system/log';
import { SummaryStatusHandler } from './statusHandler';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  createJobCleaner,
  type JobCleanupResult,
  type JobCleanupOptions
} from '../utils/jobCleanup';
import type { LanguageType } from './util/languageUtil';
import { detectEvaluationLanguage } from './util/languageUtil';

export interface EvaluationSummaryJobData {
  evalId: string;
  metricId: string;
  languageType: LanguageType;
}

export function getEvaluationSummaryQueue() {
  return getQueue<EvaluationSummaryJobData>(QueueNames.evaluationSummary, {
    defaultJobOptions: {
      removeOnComplete: {
        count: 0
      },
      removeOnFail: {
        count: 0
      }
    }
  });
}

async function checkActiveSummaryJob(evalId: string, metricId: string): Promise<boolean> {
  try {
    const queue = getEvaluationSummaryQueue();
    const activeJobs = await queue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
    const existingJob = activeJobs.find(
      (job) => job.data.evalId === evalId && job.data.metricId === metricId
    );

    return !!existingJob;
  } catch (error) {
    addLog.error('[EvaluationSummary] Failed to check active summary job', {
      evalId,
      metricId,
      error
    });
    return false;
  }
}

export async function addSummaryTaskToQueue(evalId: string, metricIds: string[]): Promise<void> {
  try {
    const queue = getEvaluationSummaryQueue();

    // Detect language once for the entire evaluation
    addLog.info('[EvaluationSummary] Detecting evaluation language', { evalId });
    const { language: languageType } = await detectEvaluationLanguage(evalId);
    addLog.info('[EvaluationSummary] Language detected', { evalId, languageType });

    const addPromises = metricIds.map(async (metricId) => {
      const hasActiveJob = await checkActiveSummaryJob(evalId, metricId);
      if (hasActiveJob) {
        addLog.warn('[EvaluationSummary] Task already in progress, skipping', {
          evalId,
          metricId
        });
        return null;
      }

      await SummaryStatusHandler.updateStatus(
        evalId,
        metricId,
        SummaryStatusEnum.pending,
        undefined,
        new Date()
      );

      addLog.info('[EvaluationSummary] Adding new task to queue', {
        evalId,
        metricId,
        languageType
      });

      return queue.add(
        'generateSummary',
        {
          evalId,
          metricId,
          languageType
        },
        {
          attempts: 1,
          deduplication: {
            id: `${evalId}_${metricId}`,
            ttl: 5000
          }
        }
      );
    });

    const results = await Promise.all(addPromises);
    const successfullyAdded = results.filter(Boolean).length;
    const skipped = metricIds.length - successfullyAdded;

    addLog.info('[EvaluationSummary] Task successfully added to queue', {
      evalId,
      totalRequested: metricIds.length,
      validMetricsCount: successfullyAdded,
      skippedCount: skipped
    });
  } catch (error) {
    addLog.error('[EvaluationSummary] Failed to add tasks to queue', {
      evalId,
      metricIds,
      error
    });
    throw error;
  }
}

export const removeEvaluationSummaryJobs = async (
  evalId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);
  const queue = getEvaluationSummaryQueue();

  const filterFn = (job: any) => {
    return String(job.data?.evalId) === String(evalId);
  };

  const result = await cleaner.cleanAllJobsByFilter(queue, filterFn, QueueNames.evaluationSummary);

  addLog.debug('Evaluation summary jobs cleanup completed', {
    evalId,
    result
  });

  return result;
};
