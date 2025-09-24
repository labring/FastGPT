import { addLog } from '../../../common/system/log';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { evaluationTaskQueue, evaluationItemQueue } from './mq';
import { MongoEvaluation, MongoEvalItem } from './schema';
import { Types } from 'mongoose';

/**
 * Evaluation task status calculator
 * Calculates real-time status from job queues, not database status fields
 */
export async function getEvaluationTaskStatus(evalId: string): Promise<EvaluationStatusEnum> {
  try {
    // Get task-related jobs
    const taskJobs = await evaluationTaskQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedTaskJobs = taskJobs.filter((job) => job.data.evalId === evalId);

    // If no task jobs, check evaluation item jobs
    if (relatedTaskJobs.length === 0) {
      return await getEvaluationTaskStatusFromItems(evalId);
    }

    // Get job states and prioritize by importance
    const jobStates = await Promise.all(relatedTaskJobs.map(async (job) => await job.getState()));

    // Return status by priority: evaluating > error > queuing > completed
    if (jobStates.includes('active')) {
      return EvaluationStatusEnum.evaluating;
    }

    if (jobStates.includes('failed')) {
      return EvaluationStatusEnum.error;
    }

    if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
      return EvaluationStatusEnum.queuing;
    }

    // If all task jobs completed, check evaluation item status
    return await getEvaluationTaskStatusFromItems(evalId);
  } catch (error) {
    return EvaluationStatusEnum.error;
  }
}

/**
 * Calculate evaluation task status from evaluation item jobs
 */
async function getEvaluationTaskStatusFromItems(evalId: string): Promise<EvaluationStatusEnum> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedItemJobs = itemJobs.filter((job) => job.data.evalId === evalId);

    // If no evaluation item jobs, check if task is completed via finishTime
    if (relatedItemJobs.length === 0) {
      try {
        const evaluation = await MongoEvaluation.findById(new Types.ObjectId(evalId), {
          finishTime: 1
        });
        if (evaluation?.finishTime) {
          return EvaluationStatusEnum.completed;
        }
        return EvaluationStatusEnum.queuing;
      } catch {
        return EvaluationStatusEnum.queuing;
      }
    }

    // Get job states
    const itemJobStates = await Promise.all(
      relatedItemJobs.map(async (job) => await job.getState())
    );

    // Return status by priority: evaluating > error > queuing > completed
    if (itemJobStates.includes('active')) {
      return EvaluationStatusEnum.evaluating;
    }

    if (itemJobStates.includes('failed')) {
      return EvaluationStatusEnum.error;
    }

    if (itemJobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
      return EvaluationStatusEnum.queuing;
    }

    if (itemJobStates.includes('completed')) {
      return EvaluationStatusEnum.completed;
    }

    // Default status
    return EvaluationStatusEnum.completed;
  } catch (error) {
    return EvaluationStatusEnum.error;
  }
}

/**
 * Calculate real-time status of evaluation item
 */
export async function getEvaluationItemStatus(evalItemId: string): Promise<EvaluationStatusEnum> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedJobs = itemJobs.filter((job) => job.data.evalItemId === evalItemId);

    // If no related jobs, check database status to determine if queuing or completed
    if (relatedJobs.length === 0) {
      try {
        const evalItem = await MongoEvalItem.findById(new Types.ObjectId(evalItemId), {
          finishTime: 1,
          errorMessage: 1
        });
        if (evalItem?.finishTime) {
          return evalItem.errorMessage
            ? EvaluationStatusEnum.error
            : EvaluationStatusEnum.completed;
        }
        return EvaluationStatusEnum.queuing;
      } catch {
        return EvaluationStatusEnum.queuing;
      }
    }

    // Get job states，取最高优先级状态
    const jobStates = await Promise.all(relatedJobs.map(async (job) => await job.getState()));

    // Return status by priority: evaluating > error > queuing > completed
    if (jobStates.includes('active')) {
      return EvaluationStatusEnum.evaluating;
    }

    if (jobStates.includes('failed')) {
      return EvaluationStatusEnum.error;
    }

    if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
      return EvaluationStatusEnum.queuing;
    }

    if (jobStates.includes('completed')) {
      return EvaluationStatusEnum.completed;
    }

    return EvaluationStatusEnum.queuing;
  } catch (error) {
    return EvaluationStatusEnum.error;
  }
}

/**
 * Batch calculate evaluation item status for performance optimization
 */
export async function getBatchEvaluationItemStatus(
  evalItemIds: string[]
): Promise<Map<string, EvaluationStatusEnum>> {
  const statusMap = new Map<string, EvaluationStatusEnum>();

  try {
    // Get all related jobs in single query to reduce queries
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    // Query database status first to distinguish queuing vs completed
    const evalItems = await MongoEvalItem.find(
      { _id: { $in: evalItemIds.map((id) => new Types.ObjectId(id)) } },
      { finishTime: 1, errorMessage: 1 }
    );

    const itemStatusByDb = new Map<string, EvaluationStatusEnum>();
    evalItems.forEach((item) => {
      const itemId = item._id.toString();
      if (item.finishTime) {
        itemStatusByDb.set(
          itemId,
          item.errorMessage ? EvaluationStatusEnum.error : EvaluationStatusEnum.completed
        );
      } else {
        itemStatusByDb.set(itemId, EvaluationStatusEnum.queuing);
      }
    });

    // Initialize default status for each evalItemId based on database status
    evalItemIds.forEach((id) => {
      statusMap.set(id, itemStatusByDb.get(id) || EvaluationStatusEnum.queuing);
    });

    // Group jobs by evalItemId and batch get states
    const jobsByItemId = new Map<string, any[]>();
    itemJobs.forEach((job) => {
      if (evalItemIds.includes(job.data.evalItemId)) {
        const itemId = job.data.evalItemId;
        if (!jobsByItemId.has(itemId)) {
          jobsByItemId.set(itemId, []);
        }
        jobsByItemId.get(itemId)!.push(job);
      }
    });

    // Optimize: batch get all job states to reduce async calls
    const allJobsToCheck = Array.from(jobsByItemId.values()).flat();
    const allJobStates = await Promise.all(
      allJobsToCheck.map(async (job) => ({
        job,
        state: await job.getState()
      }))
    );

    // Create job to state mapping
    const jobStateMap = new Map<any, string>();
    allJobStates.forEach(({ job, state }) => {
      jobStateMap.set(job, state);
    });

    // Calculate status for each evaluation item (prioritize job status if exists)
    for (const [itemId, jobs] of jobsByItemId.entries()) {
      const jobStates = jobs.map((job) => jobStateMap.get(job)!);

      // Determine status by priority: evaluating > error > queuing > completed
      let status = EvaluationStatusEnum.queuing;

      if (jobStates.includes('active')) {
        status = EvaluationStatusEnum.evaluating;
      } else if (jobStates.includes('failed')) {
        status = EvaluationStatusEnum.error;
      } else if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
        status = EvaluationStatusEnum.queuing;
      } else if (jobStates.includes('completed')) {
        status = EvaluationStatusEnum.completed;
      }

      statusMap.set(itemId, status);
    }
  } catch (error) {
    addLog.error('Error getting batch evaluation item status:', { evalItemIds, error });
    // If error occurs, keep default status
  }

  return statusMap;
}

/**
 * Get evaluation task statistics replacing database status field-based calculation
 */
export async function getEvaluationTaskStats(evalId: string): Promise<{
  total: number;
  completed: number;
  evaluating: number;
  queuing: number;
  error: number;
}> {
  try {
    // Get all evaluation items from database
    const allEvalItems = await MongoEvalItem.find(
      { evalId: new Types.ObjectId(evalId) },
      { _id: 1, finishTime: 1, errorMessage: 1 }
    ).lean();

    const totalItems = allEvalItems.length;

    if (totalItems === 0) {
      return {
        total: 0,
        completed: 0,
        evaluating: 0,
        queuing: 0,
        error: 0
      };
    }

    // Get related jobs from job queue
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedJobs = itemJobs.filter((job) => job.data.evalId === evalId);

    // Create mapping from job ID to evaluation item ID
    const jobsByItemId = new Map<string, any>();
    relatedJobs.forEach((job) => {
      if (job.data.evalItemId) {
        jobsByItemId.set(job.data.evalItemId, job);
      }
    });

    // Count status distribution
    let completed = 0;
    let evaluating = 0;
    let queuing = 0;
    let error = 0;

    // Optimize: batch get all job states to avoid multiple async calls in loop
    const jobsToCheck = Array.from(jobsByItemId.values());
    const jobStatesWithJobs = await Promise.all(
      jobsToCheck.map(async (job) => ({
        job,
        state: await job.getState()
      }))
    );

    // Create job to state mapping
    const jobStateMap = new Map<any, string>();
    jobStatesWithJobs.forEach(({ job, state }) => {
      jobStateMap.set(job, state);
    });

    // Calculate status for each evaluation item (sync loop to avoid concurrent counter modification)
    for (const item of allEvalItems) {
      const itemId = item._id.toString();
      const job = jobsByItemId.get(itemId);

      if (job) {
        // Has corresponding job, determine by job state
        const jobState = jobStateMap.get(job);

        // Direct mapping from job state to evaluation state
        if (jobState === 'active') {
          evaluating++;
        } else if (jobState === 'failed') {
          error++;
        } else if (jobState === 'completed') {
          completed++;
        } else if (['waiting', 'delayed', 'prioritized'].includes(jobState || '')) {
          queuing++;
        } else {
          // Unknown job state, determine by database status
          if (item.finishTime) {
            if (item.errorMessage) {
              error++;
            } else {
              completed++;
            }
          } else {
            queuing++;
          }
        }
      } else {
        // No corresponding job, determine by database status
        if (item.finishTime) {
          if (item.errorMessage) {
            error++;
          } else {
            completed++;
          }
        } else {
          queuing++;
        }
      }
    }

    const stats = {
      total: totalItems,
      completed,
      evaluating,
      queuing,
      error
    };

    return stats;
  } catch (error) {
    addLog.error('Error getting evaluation task stats:', { evalId, error });
    return {
      total: 0,
      completed: 0,
      evaluating: 0,
      queuing: 0,
      error: 0
    };
  }
}

/**
 * Check if evaluation task or item jobs are active
 */
export async function checkEvaluationTaskJobActive(evalId: string): Promise<boolean> {
  try {
    const taskJobs = await evaluationTaskQueue.getJobs(['waiting', 'delayed', 'active']);
    const itemJobs = await evaluationItemQueue.getJobs(['waiting', 'delayed', 'active']);

    const hasActiveTaskJob = taskJobs.some((job) => job.data.evalId === evalId);
    const hasActiveItemJob = itemJobs.some((job) => job.data.evalId === evalId);

    return hasActiveTaskJob || hasActiveItemJob;
  } catch (error) {
    return false;
  }
}

/**
 * Check if evaluation item job is active
 */
export async function checkEvaluationItemJobActive(evalItemId: string): Promise<boolean> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs(['waiting', 'delayed', 'active']);
    return itemJobs.some((job) => job.data.evalItemId === evalItemId);
  } catch (error) {
    return false;
  }
}
