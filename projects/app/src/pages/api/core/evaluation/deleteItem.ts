import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalItem } from '@fastgpt/service/core/evaluation/evalItemSchema';
import { authEval } from '@fastgpt/service/support/permission/evaluation/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(
  req: ApiRequestProps<{}, { evalId: string; itemId: string }>,
  res: ApiResponseType<any>
) {
  const { evalId, itemId } = req.query;
  await authEval({
    req,
    per: WritePermissionVal,
    evalId,
    authToken: true,
    authApiKey: true
  });

  await MongoEvalItem.deleteOne({ _id: itemId, evalId });
}

export default NextAPI(handler);
