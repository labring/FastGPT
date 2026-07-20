import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
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

/**
 * Create channel (design §2.9.4).
 *
 * The caller declares the target kind via body.groupType — the server does not
 * infer it from the role, so root can create member channels too (root is also
 * a team admin). groupId is always derived server-side from the session.
 * - groupType=system → system channel (root only)
 * - groupType=team   → the requester's own team group channel
 * The group is auto-created inside aiproxy on first insert (idempotent).
 */
async function handler(
  req: ApiRequestProps<CreateChannelBody>,
  _res: ApiResponseType<any>
): Promise<CreateChannelResponse> {
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
