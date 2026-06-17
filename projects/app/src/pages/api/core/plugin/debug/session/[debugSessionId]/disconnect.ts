import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { revokePluginDebugSession } from '@fastgpt/service/thirdProvider/fastgptPlugin/debugSession';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  DisconnectPluginDebugSessionResponseSchema,
  type DisconnectPluginDebugSessionResponseType,
  PluginDebugSessionIdQuerySchema,
  type PluginDebugSessionIdQueryType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export type DisconnectPluginDebugSessionResponse = DisconnectPluginDebugSessionResponseType;

async function handler(
  req: ApiRequestProps<Record<string, never>, PluginDebugSessionIdQueryType>
): Promise<DisconnectPluginDebugSessionResponse> {
  const {
    query: { debugSessionId }
  } = parseApiInput({
    req,
    querySchema: PluginDebugSessionIdQuerySchema
  });
  const { tmbId } = await authCert({ req, authToken: true });
  const result = await revokePluginDebugSession({
    tmbId,
    debugSessionId
  });

  return DisconnectPluginDebugSessionResponseSchema.parse(result);
}

export default NextAPI(handler);
