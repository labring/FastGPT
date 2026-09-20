import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  assertMemberChannelPermission,
  createGroupChannel,
  createSystemChannel,
  getSystemGroupId
} from '@fastgpt/service/core/ai/channel';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateChannelBodySchema,
  CreateChannelResponseSchema,
  type CreateChannelBody,
  type CreateChannelResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 创建渠道：root 创建系统渠道，成员创建私有团队分组渠道 */
async function handler(req: ApiRequestProps<CreateChannelBody>): Promise<CreateChannelResponse> {
  const body = parseApiInput({ req, bodySchema: CreateChannelBodySchema }).body;
  const { groupType, ...channelData } = body;

  const { tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });

  if (groupType === 'system') {
    if (!isRoot) {
      return Promise.reject(ModelErrEnum.rootOnlyPermit);
    }
    await createSystemChannel(channelData);
  } else {
    if (!isRoot) {
      await assertMemberChannelPermission(tmb.permission);
    }
    await createGroupChannel(getSystemGroupId(tmbId), channelData);
  }

  return CreateChannelResponseSchema.parse(undefined);
}

export default NextAPI(handler);
