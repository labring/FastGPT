import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  DeleteEvaluationItemQuery,
  DeleteEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, DeleteEvaluationItemQuery>
): Promise<DeleteEvaluationItemResponse> {
  try {
    if (req.method !== 'DELETE') {
      return Promise.reject('Method not allowed');
    }

    const { evalItemId } = req.query;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    await EvaluationTaskService.deleteEvaluationItem(evalItemId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] 评估项删除成功', {
      evalItemId
    });

    return { message: 'Evaluation item deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation] 删除评估项失败', {
      evalItemId: req.query?.evalItemId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
