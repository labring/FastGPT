import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor } from 'bullmq';
import { addLog } from '../../../common/system/log';

export type EvaluationJobData = {
  evalId: string;
  billId: string;
};

export const evaluationQueue = getQueue<EvaluationJobData>(QueueNames.evaluation, {
  defaultJobOptions: {
    attempts: 3, // retry 3 times
    backoff: {
      type: 'exponential',
      delay: 1000 // delay 1 second between retries
    }
  }
});

export const getEvaluationWorker = (processor: Processor<EvaluationJobData>) => {
  return getWorker<EvaluationJobData>(QueueNames.evaluation, processor, {
    removeOnFail: {
      age: 15 * 24 * 60 * 60,
      count: 1000
    },
    concurrency: Number(process.env.EVALUATION_MAX_PROCESS) || 3
  });
};

export const addEvaluationJob = (data: EvaluationJobData) => {
  const evalId = String(data.evalId);

  return evaluationQueue.add(evalId, data, { deduplication: { id: evalId } });
};

export const checkEvaluationJobActive = async (evalId: string): Promise<boolean> => {
  try {
    const jobId = await evaluationQueue.getDeduplicationJobId(evalId);
    if (!jobId) return false;

    const job = await evaluationQueue.getJob(jobId);
    if (!job) return false;

    const jobState = await job.getState();
    return ['waiting', 'delayed', 'prioritized', 'active'].includes(jobState);
  } catch (error) {
    addLog.error('Failed to check evaluation job status', { evalId, error });
    return false;
  }
};
