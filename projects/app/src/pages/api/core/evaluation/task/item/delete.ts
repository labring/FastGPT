import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  DeleteEvaluationItemRequest,
  DeleteEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { authEvaluationItemWrite } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, DeleteEvaluationItemRequest>
): Promise<DeleteEvaluationItemResponse> {
  try {
    const { evalItemId } = req.query;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    const { teamId } = await authEvaluationItemWrite(evalItemId, {
      req,
      authApiKey: true,
      authToken: true
    });

    await EvaluationTaskService.deleteEvaluationItem(evalItemId, teamId);

    addLog.info('[Evaluation] Evaluation item deleted successfully', {
      evalItemId
    });

    return { message: 'Evaluation item deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to delete evaluation item', {
      evalItemId: req.query?.evalItemId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
