import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { buildPluginDebugConnectionUrl } from '@/service/core/plugin/debug/connectionUrl';
import { assertCommercialPluginDebugEnabled } from '@/service/core/plugin/debug/authCommercialDebug';
import {
  RefreshPluginDebugConnectionKeyBodySchema,
  RefreshPluginDebugConnectionKeyResponseSchema,
  type RefreshPluginDebugConnectionKeyBodyType,
  type RefreshPluginDebugConnectionKeyResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export type RefreshPluginDebugConnectionKeyBody = RefreshPluginDebugConnectionKeyBodyType;
export type RefreshPluginDebugConnectionKeyResponse = RefreshPluginDebugConnectionKeyResponseType;

async function handler(
  req: ApiRequestProps<RefreshPluginDebugConnectionKeyBody>
): Promise<RefreshPluginDebugConnectionKeyResponse> {
  parseApiInput({
    req,
    bodySchema: RefreshPluginDebugConnectionKeyBodySchema
  });
  const { tmbId } = await authCert({ req, authToken: true });
  assertCommercialPluginDebugEnabled();
  const result = await pluginClient.refreshDebugSessionKey({ tmbId });
  const connectionUrl = buildPluginDebugConnectionUrl({
    req,
    connectionKey: result.connectionKey
  });

  return RefreshPluginDebugConnectionKeyResponseSchema.parse({
    ...result,
    connectionUrl
  });
}

export default NextAPI(handler);
