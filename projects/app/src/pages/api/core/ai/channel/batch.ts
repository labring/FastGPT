import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  batchDeleteGroupChannels,
  batchDeleteSystemChannels,
  batchUpdateGroupChannelStatus,
  batchUpdateSystemChannelStatus,
  getBatchChannelsAffectedModels,
  normalizeAiproxyError
} from '@fastgpt/service/core/ai/channel';
import { resolveChannelsForOperation } from '@/service/core/ai/channel/resolve';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchChannelBodySchema,
  BatchDeleteChannelsResponseSchema,
  BatchUpdateChannelsStatusResponseSchema,
  type BatchChannelBody,
  type BatchChannelResponse
} from '@fastgpt/global/openapi/core/ai/channel/api';

/** 批量操作渠道（批量删除 / 批量启用停用） */
async function handler(req: ApiRequestProps<BatchChannelBody>): Promise<BatchChannelResponse> {
  const body = parseApiInput({ req, bodySchema: BatchChannelBodySchema }).body;
  const { ids, channelType, action } = body;

  const { tmbId, isRoot } = await authUserPer({ req, authToken: true });
  if (channelType === 'system' && !isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  const resolved = await resolveChannelsForOperation({ ids, channelType, tmbId, isRoot });

  if (action === 'delete') {
    const affectedModels = await getBatchChannelsAffectedModels(resolved.map((r) => r.channel));

    try {
      if (channelType === 'system') {
        await batchDeleteSystemChannels(ids);
      } else {
        const idsByGroup = new Map<string, number[]>();
        for (const item of resolved) {
          if (item.kind === 'group') {
            const list = idsByGroup.get(item.groupId) || [];
            list.push(item.channel.id);
            idsByGroup.set(item.groupId, list);
          }
        }
        for (const [groupId, groupIds] of idsByGroup.entries()) {
          await batchDeleteGroupChannels(groupId, groupIds);
        }
      }
    } catch (error) {
      return Promise.reject(normalizeAiproxyError(error));
    }

    return BatchDeleteChannelsResponseSchema.parse({ affectedModels });
  }

  const status = body.status;
  try {
    if (channelType === 'system') {
      await batchUpdateSystemChannelStatus(ids, status);
    } else {
      const idsByGroup = new Map<string, number[]>();
      for (const item of resolved) {
        if (item.kind === 'group') {
          const list = idsByGroup.get(item.groupId) || [];
          list.push(item.channel.id);
          idsByGroup.set(item.groupId, list);
        }
      }
      for (const [groupId, groupIds] of idsByGroup.entries()) {
        await batchUpdateGroupChannelStatus(groupId, groupIds, status);
      }
    }
  } catch (error) {
    return Promise.reject(normalizeAiproxyError(error));
  }

  return BatchUpdateChannelsStatusResponseSchema.parse(undefined);
}

export default NextAPI(handler);
