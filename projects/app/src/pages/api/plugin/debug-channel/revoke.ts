import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  RevokePluginDebugChannelBodySchema,
  RevokePluginDebugChannelResponseSchema,
  type RevokePluginDebugChannelBodyType,
  type RevokePluginDebugChannelResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export type RevokePluginDebugChannelBody = RevokePluginDebugChannelBodyType;
export type RevokePluginDebugChannelResponse = RevokePluginDebugChannelResponseType;

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
  req: ApiRequestProps<RevokePluginDebugChannelBody>
): Promise<RevokePluginDebugChannelResponse> {
  parseApiInput({
    req,
    bodySchema: RevokePluginDebugChannelBodySchema
  });
  const { tmbId } = await authCert({ req, authToken: true });
  const result = await pluginClient
    .revokeDebugSession({
      tmbId,
      reason: 'user-revoke'
    })
    .catch((error) => {
      // 关闭调试是用户侧清理动作；通道已释放时，也应允许前端清掉本地调试态。
      if (isNotFoundError(error)) {
        return {
          revoked: false
        };
      }

      throw error;
    });

  return RevokePluginDebugChannelResponseSchema.parse(result);
}

export default NextAPI(handler);
