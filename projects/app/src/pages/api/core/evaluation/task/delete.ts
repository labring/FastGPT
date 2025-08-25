import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  DeleteEvaluationQuery,
  DeleteEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, DeleteEvaluationQuery>
): Promise<DeleteEvaluationResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Evaluation ID is required');
    }

    await EvaluationTaskService.deleteEvaluation(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] 评估任务删除成功', {
      evaluationId: id
    });

    return { message: 'Evaluation deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation] 删除评估任务失败', {
      evaluationId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
