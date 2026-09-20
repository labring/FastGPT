import type { ApiRequestProps } from '@fastgpt/next/type';
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

/** 查询渠道列表：root 可查看系统渠道或私有渠道，成员查看私有渠道 */
async function handler(
  req: ApiRequestProps<Record<string, never>, ListChannelsQuery>
): Promise<ListChannelsResponse> {
  const { pageNum, pageSize, groupType, search } = parseApiInput({
    req,
    querySchema: ListChannelsQuerySchema
  }).query;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });

  if (isRoot && groupType === 'system') {
    return ListChannelsResponseSchema.parse(
      await getSystemChannelList({ pageNum, pageSize, search })
    );
  }
  return ListChannelsResponseSchema.parse(
    await getMemberChannelList({ tmbId, pageNum, pageSize, search })
  );
}

export default NextAPI(handler);
