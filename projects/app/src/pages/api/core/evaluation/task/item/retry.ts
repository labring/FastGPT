import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  RetryEvaluationItemRequest,
  RetryEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<RetryEvaluationItemRequest>
): Promise<RetryEvaluationItemResponse> {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { evalItemId } = req.body;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    await EvaluationTaskService.retryEvaluationItem(evalItemId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation item retry started successfully', {
      evalItemId
    });

    return { message: 'Evaluation item retry started successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to retry evaluation item', {
      evalItemId: req.body?.evalItemId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
