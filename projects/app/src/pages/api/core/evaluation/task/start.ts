import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StartEvaluationBody,
  StartEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<StartEvaluationBody>
): Promise<StartEvaluationResponse> {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { evaluationId } = req.body;

    if (!evaluationId) {
      return Promise.reject('Evaluation ID is required');
    }

    await EvaluationTaskService.startEvaluation(evaluationId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] 评估任务启动成功', {
      evaluationId
    });

    return { message: 'Evaluation started successfully' };
  } catch (error) {
    addLog.error('[Evaluation] 启动评估任务失败', {
      evaluationId: req.body?.evaluationId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
