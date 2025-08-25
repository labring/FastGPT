import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  UpdateEvaluationBody,
  UpdateEvaluationResponse,
  UpdateEvaluationQuery
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateEvaluationBody, UpdateEvaluationQuery>
): Promise<UpdateEvaluationResponse> {
  try {
    const { id } = req.query;
    const { name, description } = req.body;

    if (!id) {
      return Promise.reject('Evaluation ID is required');
    }

    // 验证更新参数
    if (name !== undefined && !name?.trim()) {
      return Promise.reject('Evaluation name cannot be empty');
    }

    await EvaluationTaskService.updateEvaluation(
      id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() })
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation] 评估任务更新成功', {
      evaluationId: id,
      updates: { name, description }
    });

    return { message: 'Evaluation updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation] 更新评估任务失败', {
      evaluationId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
