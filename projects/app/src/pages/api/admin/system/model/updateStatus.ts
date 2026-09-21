import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin, authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertMemberChannelPermission } from '@fastgpt/service/core/ai/channel';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelStatusBodySchema,
  type UpdateSystemModelStatusBody
} from '@fastgpt/global/openapi/admin/system/model/api';
import { updateSystemModelStatus } from '@fastgpt/service/core/ai/config/service';

async function handler(req: ApiRequestProps<UpdateSystemModelStatusBody>): Promise<void> {
  const { modelIds, isActive, channelType } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelStatusBodySchema
  }).body;

  if (channelType === 'team') {
    const { tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });
    if (!isRoot) {
      await assertMemberChannelPermission(tmb.permission);
    }
    await updateSystemModelStatus({
      modelIds,
      isActive,
      scope: ModelScopeEnum.team,
      tmbId
    });
  } else {
    await authSystemAdmin({ req });
    await updateSystemModelStatus({
      modelIds,
      isActive,
      scope: ModelScopeEnum.system
    });
  }
}

export default NextAPI(handler);
