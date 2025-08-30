import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { addLog } from '@fastgpt/service/common/system/log';
import type {
  RetryFailedEvaluationItemsRequest,
  RetryFailedItemsResponse
} from '@fastgpt/global/core/evaluation/api';

async function handler(
  req: ApiRequestProps<RetryFailedEvaluationItemsRequest>
): Promise<RetryFailedItemsResponse> {
  try {
    const { evalId } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    const retryCount = await EvaluationTaskService.retryFailedItems(evalId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Failed items retry batch started successfully', {
      evalId,
      retryCount
    });

    return {
      message: 'Failed items retry started successfully',
      retryCount
    };
  } catch (error) {
    addLog.error('[Evaluation] Failed to retry failed items batch', {
      evalId: req.body?.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
