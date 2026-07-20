import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  normalizeAiproxyError,
  testGroupChannel,
  testSystemChannel
} from '@fastgpt/service/core/ai/channel';
import { resolveChannelForOperation } from '@/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  TestChannelQuerySchema,
  TestChannelResponseSchema,
  type TestChannelQuery,
  type TestChannelResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * Test one model on a channel (design §2.9.4).
 * Same routing as update; the test result is persisted inside aiproxy.
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, TestChannelQuery>,
  _res: ApiResponseType<any>
): Promise<TestChannelResponse> {
  const { id, model, channelType } = parseApiInput({
    req,
    querySchema: TestChannelQuerySchema
  }).query;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });

  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }
  const resolved = await resolveChannelForOperation({ id, channelType, tmbId, isRoot });

  try {
    if (resolved.kind === 'system') {
      await testSystemChannel(id, model);
    } else {
      await testGroupChannel(resolved.groupId, id, model);
    }
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return TestChannelResponseSchema.parse(undefined);
}

export default NextAPI(handler);
