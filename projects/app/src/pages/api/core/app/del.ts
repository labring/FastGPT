import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteAppQuerySchema,
  DeleteAppResponseSchema,
  type DeleteAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { deleteApp } from '@/service/core/app/delete';

async function handler(req: NextApiRequest): Promise<DeleteAppResponseType> {
  const { appId } = parseApiInput({
    req,
    querySchema: DeleteAppQuerySchema
  }).query;

  if (!appId) {
    return Promise.reject('参数错误');
  }

  const ids = await deleteApp({ req, appId });

  return DeleteAppResponseSchema.parse(ids);
}

export default NextAPI(handler);
