import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getChannelTypeMetas } from '@fastgpt/service/core/ai/channel';
import {
  ProviderMetasResponseSchema,
  type ProviderMetasResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 获取渠道 Provider 元数据配置 */
async function handler(
  req: ApiRequestProps<Record<string, never>, Record<string, never>>
): Promise<ProviderMetasResponse> {
  await authUserPer({ req, authToken: true });
  return ProviderMetasResponseSchema.parse(await getChannelTypeMetas());
}

export default NextAPI(handler);
