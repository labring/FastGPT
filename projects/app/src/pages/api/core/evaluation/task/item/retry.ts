import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  RetryEvaluationItemBody,
  RetryEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<RetryEvaluationItemBody>
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

    addLog.info('[Evaluation] 评估项重试成功', {
      evalItemId
    });

    return { message: 'Evaluation item retry started successfully' };
  } catch (error) {
    addLog.error('[Evaluation] 重试评估项失败', {
      evalItemId: req.body?.evalItemId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
