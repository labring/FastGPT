import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  EvaluationStatsQuery,
  EvaluationStatsResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, EvaluationStatsQuery>
): Promise<EvaluationStatsResponse> {
  try {
    const { evaluationId } = req.query;

    if (!evaluationId) {
      return Promise.reject('Evaluation ID is required');
    }

    const stats = await EvaluationTaskService.getEvaluationStats(evaluationId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] 评估任务统计信息查询成功', {
      evaluationId,
      total: stats.total,
      completed: stats.completed,
      avgScore: stats.avgScore
    });

    return stats;
  } catch (error) {
    addLog.error('[Evaluation] 查询评估任务统计信息失败', {
      evaluationId: req.query?.evaluationId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
