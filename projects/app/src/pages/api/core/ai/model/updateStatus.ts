import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { channelTypeToScope } from '@fastgpt/global/core/ai/model/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateModelStatusBodySchema,
  type UpdateModelStatusBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { updateModelStatus } from '@fastgpt/service/core/ai/model/mutation';

async function handler(req: ApiRequestProps<UpdateModelStatusBody>): Promise<void> {
  const { modelIds, isActive, channelType } = parseApiInput({
    req,
    bodySchema: UpdateModelStatusBodySchema
  }).body;

  const { tmbId, teamId } = await authModelManage({ req, channelType });

  await updateModelStatus({
    modelIds,
    isActive,
    scope: channelTypeToScope(channelType),
    teamId,
    tmbId: channelType === 'team' ? tmbId : undefined
  });
}

export default NextAPI(handler);
