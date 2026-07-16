import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type { ApiRequestProps } from '@fastgpt/next/types';
import { buildPluginDebugConnectionUrl } from '@/service/core/plugin/debug/connectionUrl';
import { assertCommercialPluginDebugEnabled } from '@/service/core/plugin/debug/authCommercialDebug';
import {
  EnablePluginDebugChannelBodySchema,
  EnablePluginDebugChannelResponseSchema,
  type EnablePluginDebugChannelBodyType,
  type EnablePluginDebugChannelResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export type EnablePluginDebugChannelBody = EnablePluginDebugChannelBodyType;
export type EnablePluginDebugChannelResponse = EnablePluginDebugChannelResponseType;

async function handler(
  req: ApiRequestProps<EnablePluginDebugChannelBody>
): Promise<EnablePluginDebugChannelResponse> {
  parseApiInput({
    req,
    bodySchema: EnablePluginDebugChannelBodySchema
  });
  const { tmbId } = await authCert({ req, authToken: true });
  assertCommercialPluginDebugEnabled();
  const result = await pluginClient.createDebugSession({ tmbId });
  const connectionUrl = buildPluginDebugConnectionUrl({
    req,
    connectionKey: result.connectionKey
  });

  return EnablePluginDebugChannelResponseSchema.parse({
    ...result,
    connectionUrl
  });
}

export default NextAPI(handler);
