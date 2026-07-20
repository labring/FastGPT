import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getMemberChannelList, getSystemChannelList } from '@fastgpt/service/core/ai/channel';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ListChannelsQuerySchema,
  ListChannelsResponseSchema,
  type ListChannelsQuery,
  type ListChannelsResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * Channel list (design §2.9.4).
 *
 * Read-only view: any authenticated member may view their own group channels
 * (F1 场景1/场景3 — the page stays usable with the create button disabled for
 * members without model-create permission). The create permission only gates
 * channel creation; ownership gates operations on existing channels.
 *
 * Member (or root without groupType): the requester's own group channels.
 * Root with groupType=system: system channels view.
 * Root with groupType=team: the root member's own group channels.
 * Each item carries relatedModelCount (computed by the service layer).
 *
 * GET + query per ListChannelsQuerySchema (unlike the model list which is
 * POST + body — this endpoint keeps the schema declared in the openapi module).
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, ListChannelsQuery>,
  _res: ApiResponseType<any>
): Promise<ListChannelsResponse> {
  const { pageNum, pageSize, groupType } = parseApiInput({
    req,
    querySchema: ListChannelsQuerySchema
  }).query;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });

  if (isRoot && groupType === 'system') {
    return ListChannelsResponseSchema.parse(await getSystemChannelList({ pageNum, pageSize }));
  }
  return ListChannelsResponseSchema.parse(await getMemberChannelList({ tmbId, pageNum, pageSize }));
}

export default NextAPI(handler);
