import { getModelHandle } from '@fastgpt/service/core/ai/model';

import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin, authUserPer } from '@fastgpt/service/support/permission/user/auth';

import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  GetAdminSystemModelDetailResponseSchema,
  type AdminSystemModelReference,
  type GetAdminSystemModelDetailResponse
} from '@fastgpt/global/openapi/admin/system/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  assertMemberChannelPermission,
  getAdminAIProxyChannelItems,
  getSystemGroupId,
  listAllGroupChannels
} from '@fastgpt/service/core/ai/channel';

async function handler(
  req: ApiRequestProps<Record<string, never>, AdminSystemModelReference>
): Promise<GetAdminSystemModelDetailResponse> {
  const reference = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;
  const { channelType } = reference;

  const modelHandle = await getModelHandle();
  const modelItem = modelHandle.findModelData(reference);
  if (!modelItem) return Promise.reject(ModelErrEnum.unExist);

  const isTeam =
    channelType === 'team' || (modelItem as { scope?: string }).scope === ModelScopeEnum.team;

  if (isTeam) {
    const { tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });
    if (!isRoot) {
      await assertMemberChannelPermission(tmb.permission);
      const ownerTmbId = (modelItem as { tmbId?: string }).tmbId;
      if (ownerTmbId && String(ownerTmbId) !== tmbId) {
        return Promise.reject(ModelErrEnum.unExist);
      }
    }
    const targetTmbId = (modelItem as { tmbId?: string }).tmbId
      ? String((modelItem as { tmbId?: string }).tmbId)
      : tmbId;
    const groupChannels = await listAllGroupChannels(getSystemGroupId(targetTmbId)).catch(() => []);
    return GetAdminSystemModelDetailResponseSchema.parse({
      model: modelItem,
      channels: groupChannels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        protocol: {
          name: { en: channel.name, 'zh-CN': channel.name, 'zh-Hant': channel.name },
          avatar: 'model/openai'
        },
        status: channel.status,
        isAssociated: (channel.models || []).includes(modelItem.model)
      }))
    });
  }

  await authSystemAdmin({ req });

  const channelItems = await getAdminAIProxyChannelItems();

  // 详情一次返回完整参数和渠道关系，避免编辑弹窗依赖列表快照或再次查询渠道。
  return GetAdminSystemModelDetailResponseSchema.parse({
    model: modelItem,
    channels: channelItems.map((channel) => ({
      ...channel.summary,
      isAssociated: channel.models.includes(modelItem.model)
    }))
  });
}

export default NextAPI(handler);
