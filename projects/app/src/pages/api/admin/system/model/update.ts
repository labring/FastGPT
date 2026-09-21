import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin, authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertMemberChannelPermission } from '@fastgpt/service/core/ai/channel';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelBodySchema,
  type UpdateSystemModelBody
} from '@fastgpt/global/openapi/admin/system/model/api';
import { updateSystemModel } from '@/service/core/ai/model/service';

async function handler(req: ApiRequestProps<UpdateSystemModelBody>): Promise<void> {
  const input = parseApiInput({
    req,
    bodySchema: UpdateSystemModelBodySchema
  }).body;
  const { channelType } = input;

  if (channelType === 'team') {
    const { tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });
    if (!isRoot) {
      await assertMemberChannelPermission(tmb.permission);
    }
    await updateSystemModel({ ...input, channelType: 'team', tmbId });
  } else {
    await authSystemAdmin({ req });
    await updateSystemModel({ ...input, channelType: 'system' });
  }
}

export default NextAPI(handler);
