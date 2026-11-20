import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { checkWebSyncLimit } from '@fastgpt/service/support/user/utils';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  WebSyncLimitQuerySchema,
  WebSyncLimitResponseSchema,
  type WebSyncLimitResponse
} from '@fastgpt/global/openapi/support/user/team/limit/api';

async function handler(req: ApiRequestProps): Promise<WebSyncLimitResponse> {
  parseApiInput({ req, querySchema: WebSyncLimitQuerySchema });

  // 凭证校验
  const { teamId } = await authCert({ req, authToken: true });

  await checkWebSyncLimit({
    teamId,
    limitMinutes: getSystemInstanceConfig().resource.websiteSyncLimitMinuted
  });

  return WebSyncLimitResponseSchema.parse(undefined);
}

export default NextAPI(handler);
