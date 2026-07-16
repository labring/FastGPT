import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
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

export default NextAPI(
  useIPFrequencyLimit({
    id: 'plugin-debug-channel-connection-key-exchange',
    seconds: 60,
    limit: 60,
    force: true
  }),
  handler
);
