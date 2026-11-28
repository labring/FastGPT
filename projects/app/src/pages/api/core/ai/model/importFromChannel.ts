import type {
  ImportFromChannelBody,
  ImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import {
  ImportFromChannelBodySchema,
  ImportFromChannelResponseSchema
} from '@fastgpt/global/openapi/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScope } from '@/service/core/ai/model/auth';
import { importFromChannel } from '@fastgpt/service/core/ai/model/importFromChannel';

async function handler(
  req: ApiRequestProps<ImportFromChannelBody>
): Promise<ImportFromChannelResponse> {
  const { body } = parseApiInput({
    req,
    bodySchema: ImportFromChannelBodySchema
  });
  const actor = await authModelScope({ req, channelType: body.channelType });
  const result = await importFromChannel({ ...body, ...actor });

  return ImportFromChannelResponseSchema.parse(result);
}

export default NextAPI(handler);
