import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { addLog } from '@fastgpt/service/common/system/log';

export type RetryFailedItemsBody = {
  evaluationId: string;
};

export type RetryFailedItemsResponse = {
  message: string;
  retryCount: number;
};

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

    addLog.info('[Evaluation] 批量重试失败项成功', {
      evaluationId,
      retryCount
    });

    return {
      message: 'Failed items retry started successfully',
      retryCount
    };
  } catch (error) {
    addLog.error('[Evaluation] 批量重试失败项失败', {
      evaluationId: req.body?.evaluationId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
