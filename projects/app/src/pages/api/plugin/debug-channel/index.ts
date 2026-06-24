import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetPluginDebugChannelQuerySchema,
  GetPluginDebugChannelResponseSchema,
  type GetPluginDebugChannelQueryType,
  type GetPluginDebugChannelResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export type GetPluginDebugChannelQuery = GetPluginDebugChannelQueryType;
export type GetPluginDebugChannelResponse = GetPluginDebugChannelResponseType;

function isNotFoundError(error: unknown) {
  if (error instanceof Error && /not found|404/i.test(error.message)) return true;
  if (!error || typeof error !== 'object') return false;

  const status = (error as { status?: unknown; statusCode?: unknown; code?: unknown }).status;
  const statusCode = (error as { status?: unknown; statusCode?: unknown; code?: unknown })
    .statusCode;
  const code = (error as { status?: unknown; statusCode?: unknown; code?: unknown }).code;
  return status === 404 || statusCode === 404 || code === 404;
}

async function handler(
  req: ApiRequestProps<Record<string, never>, GetPluginDebugChannelQuery>
): Promise<GetPluginDebugChannelResponse> {
  parseApiInput({
    req,
    querySchema: GetPluginDebugChannelQuerySchema
  });
  const { tmbId } = await authCert({ req, authToken: true });
  const result = await pluginClient.getDebugSessionStatus({ tmbId }).catch((error) => {
    if (isNotFoundError(error)) {
      return {
        tmbId,
        status: 'revoked',
        enabled: false,
        plugins: []
      };
    }

    throw error;
  });

  return GetPluginDebugChannelResponseSchema.parse(result);
}

export default NextAPI(handler);
