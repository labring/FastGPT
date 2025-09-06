import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { addLog } from '@fastgpt/service/common/system/log';
import type {
  RetryFailedEvaluationItemsRequest,
  RetryFailedItemsResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<RetryFailedEvaluationItemsRequest>
): Promise<RetryFailedItemsResponse> {
  try {
    const { evalId } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    const { teamId } = await authEvaluationTaskWrite(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    const retryCount = await EvaluationTaskService.retryFailedItems(evalId, teamId);

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
