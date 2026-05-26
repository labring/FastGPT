import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { GetConfigJsonResponseSchema } from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps<any, any>, res: ApiResponseType<any>): Promise<string> {
  await authSystemAdmin({ req });
  return GetConfigJsonResponseSchema.parse(JSON.stringify(global.systemActiveModelList, null, 2));
}

export default NextAPI(handler);
