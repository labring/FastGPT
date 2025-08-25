import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import type { EvalTarget } from '@fastgpt/global/core/evaluation/type';
import type {
  CreateEvaluationBody,
  CreateEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { validateTargetConfig } from '@fastgpt/service/core/evaluation/target';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

async function handler(
  req: ApiRequestProps<CreateEvaluationBody>
): Promise<CreateEvaluationResponse> {
  try {
    const { teamId } = await authCert({ req, authToken: true });
    const { name, description, datasetId, target, evaluators } = req.body;

    // 验证必填字段
    if (!name?.trim()) {
      return Promise.reject('Evaluation name is required');
    }

    const targetValidation = await validateTargetConfig(target as EvalTarget);
    if (!targetValidation.success) {
      return Promise.reject(`Target validation failed: ${targetValidation.message}`);
    }

    if (!datasetId) {
      return Promise.reject('Dataset ID is required');
    }

    if (!evaluators || !Array.isArray(evaluators) || evaluators.length === 0) {
      return Promise.reject('At least one evaluator is required');
    }

    // 验证evaluators配置
    for (const evaluator of evaluators) {
      if (!evaluator.metric || !evaluator.metric._id || !evaluator.metric.type) {
        return Promise.reject('Each evaluator must contain a valid metric configuration');
      }
    }

    // 检查 AI Points 余额
    await checkTeamAIPoints(teamId);

    // 创建评估任务
    const evaluation = await EvaluationTaskService.createEvaluation(
      {
        name: name.trim(),
        description: description?.trim(),
        datasetId,
        target: target as EvalTarget,
        evaluators
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation] 评估任务创建成功', {
      evaluationId: evaluation._id,
      name: evaluation.name,
      datasetId,
      targetType: target.type,
      targetConfig: target.config,
      evaluatorCount: evaluators.length
    });

    return evaluation;
  } catch (error) {
    addLog.error('[Evaluation] 创建评估任务失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
