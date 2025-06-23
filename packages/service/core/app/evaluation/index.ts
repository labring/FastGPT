import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor } from 'bullmq';
import { EvalStatusEnum } from './constants';
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
    concurrency: 3
  });
};

export const addEvaluationJob = (data: EvaluationJobData) => {
  const evalId = String(data.evalId);

  return evaluationQueue.add(evalId, data, { deduplication: { id: evalId } });
};

// export const removeEvaluationJob = async (evalId: string): Promise<boolean> => {
//   try {
//     const job = await evaluationQueue.getJob(evalId);
//     if (job) {
//       const jobState = await job.getState();
//       if (['waiting', 'delayed', 'prioritized'].includes(jobState)) {
//         await job.remove();
//         addLog.info('Evaluation job removed from queue', { evalId, jobState });
//         return true;
//       } else if (jobState === 'active') {
//         addLog.info(
//           'Cannot remove active evaluation job, will stop naturally when evaluation is deleted',
//           { evalId }
//         );
//         return false;
//       } else {
//         addLog.info('Evaluation job already in final state', { evalId, jobState });
//         return false;
//       }
//     } else {
//       addLog.info('Evaluation job not found in queue', { evalId });
//       return false;
//     }
//   } catch (error) {
//     addLog.error('Failed to remove evaluation job from queue', { evalId, error });
//     return false;
//   }
// };

// export const getEvaluationJobStatus = async (evalId: string) => {
//   const jobId = await evaluationQueue.getDeduplicationJobId(evalId);
//   if (!jobId) {
//     return {
//       status: EvalStatusEnum.active,
//       errorMsg: undefined
//     };
//   }

//   const job = await evaluationQueue.getJob(jobId);
//   if (!job) {
//     return {
//       status: EvalStatusEnum.active,
//       errorMsg: undefined
//     };
//   }

//   const jobState = await job.getState();

//   if (jobState === 'failed' || jobState === 'unknown') {
//     return {
//       status: EvalStatusEnum.error,
//       errorMsg: undefined
//     };
//   }
//   if (['waiting-children', 'waiting'].includes(jobState)) {
//     return {
//       status: EvalStatusEnum.waiting,
//       errorMsg: undefined
//     };
//   }
//   if (jobState === 'active') {
//     return {
//       status: EvalStatusEnum.evaluating,
//       errorMsg: undefined
//     };
//   }

//   return {
//     status: EvalStatusEnum.active,
//     errorMsg: undefined
//   };
// };

// export const cancelEvaluationJob = async (evalId: string) => {
//   const jobId = await evaluationQueue.getDeduplicationJobId(evalId);
//   if (!jobId) {
//     return;
//   }
//   await evaluationQueue.remove(jobId);
// };
