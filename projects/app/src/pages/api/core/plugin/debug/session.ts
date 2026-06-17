import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { serviceEnv } from '@fastgpt/service/env';
import { createPluginDebugSession } from '@fastgpt/service/thirdProvider/fastgptPlugin/debugSession';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  CreatePluginDebugSessionBodySchema,
  CreatePluginDebugSessionResponseSchema,
  type CreatePluginDebugSessionBodyType,
  type CreatePluginDebugSessionResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export type CreatePluginDebugSessionBody = CreatePluginDebugSessionBodyType;
export type CreatePluginDebugSessionResponse = CreatePluginDebugSessionResponseType;

function getFastGPTBaseUrl(req: ApiRequestProps) {
  if (serviceEnv.FE_DOMAIN) return serviceEnv.FE_DOMAIN;

  const host = req.headers.host;
  if (!host) {
    throw new Error('Missing request host');
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'http';

  return `${proto}://${host}`;
}

async function handler(
  req: ApiRequestProps<CreatePluginDebugSessionBody>
): Promise<CreatePluginDebugSessionResponse> {
  const { body } = parseApiInput({
    req,
    bodySchema: CreatePluginDebugSessionBodySchema
  });
  const { tmbId } = await authCert({ req, authToken: true });
  const result = await createPluginDebugSession({
    tmbId,
    ttlMs: body.ttlMs,
    fastgptBaseUrl: getFastGPTBaseUrl(req)
  });

  return CreatePluginDebugSessionResponseSchema.parse(result);
}

export default NextAPI(handler);
