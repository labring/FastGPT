import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getPluginDebugSessionStatus } from '@fastgpt/service/thirdProvider/fastgptPlugin/debugSession';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  PluginDebugSessionIdQuerySchema,
  type PluginDebugSessionIdQueryType,
  PluginDebugSessionStatusResponseSchema,
  type PluginDebugSessionStatusResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export type GetPluginDebugSessionStatusResponse = PluginDebugSessionStatusResponseType;

async function handler(
  req: ApiRequestProps<Record<string, never>, PluginDebugSessionIdQueryType>
): Promise<GetPluginDebugSessionStatusResponse> {
  const {
    query: { debugSessionId }
  } = parseApiInput({
    req,
    querySchema: PluginDebugSessionIdQuerySchema
  });
  const { tmbId } = await authCert({ req, authToken: true });
  const result = await getPluginDebugSessionStatus({
    tmbId,
    debugSessionId
  });

  return PluginDebugSessionStatusResponseSchema.parse(result);
}

export default NextAPI(handler);
