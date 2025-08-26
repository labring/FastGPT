import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { addLog } from '@fastgpt/service/common/system/log';
import type {
  RetryFailedItemsBody,
  RetryFailedItemsResponse
} from '@fastgpt/global/core/evaluation/api';

async function handler(
  req: ApiRequestProps<RetryFailedItemsBody>
): Promise<RetryFailedItemsResponse> {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { evaluationId } = req.body;

    if (!evaluationId) {
      return Promise.reject('Evaluation ID is required');
    }

    const retryCount = await EvaluationTaskService.retryFailedItems(evaluationId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Failed items retry batch started successfully', {
      evaluationId,
      retryCount
    });

    return {
      message: 'Failed items retry started successfully',
      retryCount
    };
  } catch (error) {
    addLog.error('[Evaluation] Failed to retry failed items batch', {
      evaluationId: req.body?.evaluationId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
