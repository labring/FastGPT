import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor } from 'bullmq';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.APP.EVALUATION);

export type EvaluationJobData = {
  evalId: string;
};

export const evaluationQueue = getQueue<EvaluationJobData>(QueueNames.evaluation, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
});

const concurrency = process.env.EVAL_CONCURRENCY ? Number(process.env.EVAL_CONCURRENCY) : 3;
export const getEvaluationWorker = (processor: Processor<EvaluationJobData>) => {
  return getWorker<EvaluationJobData>(QueueNames.evaluation, processor, {
    removeOnFail: {
      count: 1000 // Keep last 1000 failed jobs
    },
    concurrency: concurrency
  });
};

export const addEvaluationJob = (data: EvaluationJobData) => {
  const evalId = String(data.evalId);

  return evaluationQueue.add(evalId, data, { deduplication: { id: evalId } });
};

export const checkEvaluationJobActive = async (evalId: string): Promise<boolean> => {
  try {
    const jobId = await evaluationQueue.getDeduplicationJobId(String(evalId));
    if (!jobId) return false;

    const job = await evaluationQueue.getJob(jobId);
    if (!job) return false;

    const jobState = await job.getState();
    return ['waiting', 'delayed', 'prioritized', 'active'].includes(jobState);
  } catch (error) {
    logger.error('Failed to check evaluation job status', { evalId, error });
    return false;
  }
};

export const removeEvaluationJob = async (evalId: string): Promise<boolean> => {
  const formatEvalId = String(evalId);
  try {
    const jobId = await evaluationQueue.getDeduplicationJobId(formatEvalId);
    if (!jobId) {
      logger.warn('No evaluation job found to remove', { evalId });
      return false;
    }

    const job = await evaluationQueue.getJob(jobId);
    if (!job) {
      logger.warn('Evaluation job not found in queue', { evalId, jobId });
      return false;
    }

    const jobState = await job.getState();

    if (['waiting', 'delayed', 'prioritized'].includes(jobState)) {
      await job.remove();
      logger.info('Evaluation job removed successfully', { evalId, jobId, jobState });
      return true;
    } else {
      logger.warn('Cannot remove active or completed evaluation job', { evalId, jobId, jobState });
      return false;
    }
  } catch (error) {
    logger.error('Failed to remove evaluation job', { evalId, error });
    return false;
  }
};
