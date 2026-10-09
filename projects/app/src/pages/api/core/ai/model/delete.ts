import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteModelsBodySchema,
  type DeleteModelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { deleteModelsWithLifecycle } from '@fastgpt/service/core/ai/model/lifecycle';

async function handler(req: ApiRequestProps<DeleteModelsBody>): Promise<void> {
  const { modelIds, channelType } = parseApiInput({
    req,
    bodySchema: DeleteModelsBodySchema
  }).body;

  const { tmbId, teamId } = await authModelManage({ req, channelType });

  await deleteModelsWithLifecycle({
    modelIds,
    channelType,
    teamId,
    tmbId: channelType === 'team' ? tmbId : undefined
  });
}

export default NextAPI(handler);
