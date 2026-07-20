import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getChannelTypeMetas } from '@fastgpt/service/core/ai/channel';
import {
  ProviderMetasResponseSchema,
  type ProviderMetasResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * Provider metas for the channel create/edit form (defaultBaseUrl/keyHelp).
 *
 * Non-sensitive provider defaults — any authenticated user may fetch them
 * (previously root-only via the aiproxy admin passthrough). The aiproxy admin
 * token stays server-side; the passthrough itself remains root-only.
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, Record<string, never>>,
  _res: ApiResponseType<any>
): Promise<ProviderMetasResponse> {
  await authUserPer({ req, authToken: true });
  return ProviderMetasResponseSchema.parse(await getChannelTypeMetas());
}

export default NextAPI(handler);
