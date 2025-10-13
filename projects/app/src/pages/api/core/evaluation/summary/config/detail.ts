import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import type {
  GetConfigDetailQuery,
  GetConfigDetailResponse
} from '@fastgpt/global/core/evaluation/summary/api';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, GetConfigDetailQuery>
): Promise<GetConfigDetailResponse> {
  const { evalId } = req.query;

  await authEvaluationTaskRead(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  // Validate parameters
  if (!evalId || typeof evalId !== 'string') {
    return Promise.reject(EvaluationErrEnum.evalIdRequired);
  }

  // Get evaluation task configuration details
  const result = await EvaluationSummaryService.getEvaluationSummaryConfig(evalId);

  return {
    calculateType: result.calculateType,
    calculateTypeName: result.calculateTypeName,
    metricsConfig: result.metricsConfig
  };
}

export default NextAPI(handler);

export { handler };
