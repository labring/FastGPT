import { deleteSystemModels } from '@/service/core/ai/model/service';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin, authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertMemberChannelPermission } from '@fastgpt/service/core/ai/channel';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  DeleteSystemModelsBodySchema,
  type AdminSystemModelReference,
  type DeleteSystemModelsBody
} from '@fastgpt/global/openapi/admin/system/model/api';

async function handler(
  req: ApiRequestProps<DeleteSystemModelsBody, AdminSystemModelReference>
): Promise<void> {
  const { modelIds, channelType } = (() => {
    if (Array.isArray(req.body?.modelIds)) {
      return parseApiInput({ req, bodySchema: DeleteSystemModelsBodySchema }).body;
    }
    const { modelId, channelType } = parseApiInput({
      req,
      querySchema: AdminSystemModelReferenceSchema
    }).query;
    return { modelIds: [modelId], channelType };
  })();

  if (channelType === 'team') {
    const { tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });
    if (!isRoot) {
      await assertMemberChannelPermission(tmb.permission);
    }
    return deleteSystemModels({ modelIds, channelType: 'team', tmbId });
  }

  await authSystemAdmin({ req });
  return deleteSystemModels({ modelIds, channelType: 'system' });
}

export default NextAPI(handler);
