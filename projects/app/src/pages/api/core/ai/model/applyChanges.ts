import type {
  ApplyChangesBody,
  ApplyChangesResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import {
  ApplyChangesBodySchema,
  ApplyChangesResponseSchema
} from '@fastgpt/global/openapi/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScope } from '@/service/core/ai/model/auth';
import { applyChangesFromChannel } from '@fastgpt/service/core/ai/model/importFromChannel';

async function handler(req: ApiRequestProps<ApplyChangesBody>): Promise<ApplyChangesResponse> {
  const body = parseApiInput({ req, bodySchema: ApplyChangesBodySchema }).body;
  const { tmbId, teamId } = await authModelScope({ req, channelType: body.channelType });
  const result = await applyChangesFromChannel({
    channelId: body.channelId,
    operations: body.operations,
    tmbId,
    teamId
  });

  return ApplyChangesResponseSchema.parse(result);
}

export default NextAPI(handler);
