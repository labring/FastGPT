import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  DataItemListRequest,
  DataItemListResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(req: ApiRequestProps<DataItemListRequest>): Promise<DataItemListResponse> {
  const { offset, pageSize } = parsePaginationRequest(req);
  const { evalId, status, keyword } = req.body;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  // Use existing evaluation task read permission
  const { teamId } = await authEvaluationTaskRead(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const result = await EvaluationTaskService.listDataItemsGrouped(teamId, {
    evalId,
    status: status !== undefined ? Number(status) : undefined,
    keyword,
    offset,
    pageSize
  });

  return {
    list: result.list,
    total: result.total
  };
}

export default NextAPI(handler);
export { handler };
