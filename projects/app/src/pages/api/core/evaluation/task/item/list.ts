import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  ListEvaluationItemsRequest,
  ListEvaluationItemsResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<ListEvaluationItemsRequest>
): Promise<ListEvaluationItemsResponse> {
  const { offset, pageSize } = parsePaginationRequest(req);
  const { evalId } = req.body;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { teamId } = await authEvaluationTaskRead(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const result = await EvaluationTaskService.listEvaluationItems(evalId, teamId, offset, pageSize);

  return {
    list: result.items,
    total: result.total
  };
}

export default NextAPI(handler);
export { handler };
