import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getChannelTypeMetas } from '@fastgpt/service/core/ai/model/channel/service';
import {
  ProviderMetasResponseSchema,
  type ProviderMetasResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 登录后按需读取渠道类型展示与表单配置，系统和团队入口共用。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, Record<string, never>>
): Promise<ProviderMetasResponse> {
  await authUserPer({ req, authToken: true });
  return ProviderMetasResponseSchema.parse(await getChannelTypeMetas());
}

export default NextAPI(handler);
