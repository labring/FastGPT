import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ListChannelsQuerySchema,
  ListChannelsResponseSchema,
  type ListChannelsQuery,
  type ListChannelsResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getMemberChannelList,
  getSystemChannelList
} from '@fastgpt/service/core/ai/model/channel/list';

/** 查询渠道列表：root 可查看系统渠道或私有渠道，成员查看私有渠道 */
async function handler(
  req: ApiRequestProps<Record<string, never>, ListChannelsQuery>
): Promise<ListChannelsResponse> {
  // 未传 channelType 按成员私有渠道处理，与原有列表行为一致，同时统一校验安装模型权限。
  const {
    pageNum,
    pageSize,
    channelType = 'team',
    search
  } = parseApiInput({
    req,
    querySchema: ListChannelsQuerySchema
  }).query;

  const { tmbId, teamId } = await authModelScope({ req, channelType });

  if (channelType === 'system') {
    return ListChannelsResponseSchema.parse(
      await getSystemChannelList({ pageNum, pageSize, search })
    );
  }
  return ListChannelsResponseSchema.parse(
    await getMemberChannelList({ teamId, tmbId, pageNum, pageSize, search })
  );
}

export default NextAPI(handler);
