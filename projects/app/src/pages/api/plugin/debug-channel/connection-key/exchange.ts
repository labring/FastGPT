import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { assertCommercialPluginDebugEnabled } from '@/service/core/plugin/debug/authCommercialDebug';
import {
  ExchangePluginDebugConnectionKeyBodySchema,
  ExchangePluginDebugConnectionKeyQuerySchema,
  ExchangePluginDebugConnectionKeyResponseSchema,
  type ExchangePluginDebugConnectionKeyBodyType,
  type ExchangePluginDebugConnectionKeyQueryType,
  type ExchangePluginDebugConnectionKeyResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

export type ExchangePluginDebugConnectionKeyBody = ExchangePluginDebugConnectionKeyBodyType;
export type ExchangePluginDebugConnectionKeyQuery = ExchangePluginDebugConnectionKeyQueryType;
export type ExchangePluginDebugConnectionKeyResponse = ExchangePluginDebugConnectionKeyResponseType;

async function handler(
  req: ApiRequestProps<ExchangePluginDebugConnectionKeyBody, ExchangePluginDebugConnectionKeyQuery>
): Promise<ExchangePluginDebugConnectionKeyResponse> {
  const input =
    req.method === 'GET'
      ? parseApiInput({
          req,
          querySchema: ExchangePluginDebugConnectionKeyQuerySchema
        }).query
      : parseApiInput({
          req,
          bodySchema: ExchangePluginDebugConnectionKeyBodySchema
        }).body;
  assertCommercialPluginDebugEnabled();
  const result = await pluginClient.exchangeDebugSessionConnectionKey({
    connectionKey: input.connectionKey
  });

  return ExchangePluginDebugConnectionKeyResponseSchema.parse(result);
}

export default NextAPI(handler);
