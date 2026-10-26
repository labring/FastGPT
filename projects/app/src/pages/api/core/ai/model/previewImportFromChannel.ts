import type {
  PreviewImportFromChannelQuery,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import {
  PreviewImportFromChannelQuerySchema,
  PreviewImportFromChannelResponseSchema
} from '@fastgpt/global/openapi/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScope } from '@/service/core/ai/model/auth';
import { previewImportFromChannel } from '@fastgpt/service/core/ai/model/importFromChannel';

async function handler(
  req: ApiRequestProps<Record<string, never>, PreviewImportFromChannelQuery>
): Promise<PreviewImportFromChannelResponse> {
  const query = parseApiInput({ req, querySchema: PreviewImportFromChannelQuerySchema }).query;
  const { tmbId } = await authModelScope({ req, channelType: query.channelType });
  const result = await previewImportFromChannel({ channelId: query.channelId, tmbId });

  return PreviewImportFromChannelResponseSchema.parse(result);
}

export default NextAPI(handler);
