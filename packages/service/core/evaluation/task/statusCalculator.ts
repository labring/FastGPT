import { addLog } from '../../../common/system/log';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvalItem } from './schema';
import { Types } from 'mongoose';

export async function getEvaluationTaskStats(evalId: string): Promise<{
  total: number;
  completed: number;
  evaluating: number;
  queuing: number;
  error: number;
}> {
  try {
    // Get all evaluation items from database - use same logic as finishEvaluationTask
    const allEvalItems = await MongoEvalItem.find(
      { evalId: new Types.ObjectId(evalId) },
      { _id: 1, status: 1 }
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

    // Count status distribution - use same logic as finishEvaluationTask
    let completed = 0;
    let evaluating = 0;
    let queuing = 0;
    let error = 0;

    for (const item of allEvalItems) {
      const status = item.status;
      switch (status) {
        case EvaluationStatusEnum.completed:
          completed++;
          break;
        case EvaluationStatusEnum.error:
          error++;
          break;
        case EvaluationStatusEnum.evaluating:
          evaluating++;
          break;
        case EvaluationStatusEnum.queuing:
          queuing++;
          break;
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

export async function getEvaluationTaskStatus(evalId: string): Promise<EvaluationStatusEnum> {
  try {
    const stats = await getEvaluationTaskStats(evalId);

    // If no items exist, task is in queuing state
    if (stats.total === 0) {
      return EvaluationStatusEnum.queuing;
    }

    // If some items are evaluating or queuing, task is evaluating
    if (stats.evaluating > 0 || stats.queuing > 0) {
      return EvaluationStatusEnum.evaluating;
    }

    // If any items have errors, task is in error state
    if (stats.error > 0) {
      return EvaluationStatusEnum.error;
    }

    // If all items are completed, task is completed
    if (stats.completed === stats.total) {
      return EvaluationStatusEnum.completed;
    }

    // This should not happen, but if it does, return error
    return EvaluationStatusEnum.error;
  } catch (error) {
    addLog.error('Error getting evaluation task status:', { evalId, error });
    return EvaluationStatusEnum.error;
  }
}
