import { getModelHandle } from '@fastgpt/service/core/ai/model';

import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin, authUserPer } from '@fastgpt/service/support/permission/user/auth';

import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ModelReferenceSchema,
  GetModelDetailResponseSchema,
  type ModelReference,
  type GetModelDetailResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { isTeamModel, getModelOwnerTmbId } from '@fastgpt/global/core/ai/model';
import { assertMemberModelPermission } from '@fastgpt/service/support/permission/model/controller';
import {
  getMemberChannelSummaryItems,
  getSystemChannelSummaryItems
} from '@fastgpt/service/core/ai/channel/summary';

async function handler(
  req: ApiRequestProps<Record<string, never>, ModelReference>
): Promise<GetModelDetailResponse> {
  const reference = parseApiInput({ req, querySchema: ModelReferenceSchema }).query;
  const { channelType } = reference;

  const modelHandle = await getModelHandle();
  const modelItem = modelHandle.findModelData(reference);
  if (!modelItem) return Promise.reject(ModelErrEnum.unExist);

  const isTeam = channelType === 'team' || isTeamModel(modelItem);

  let targetTmbId: string | undefined;

  if (isTeam) {
    const { tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });
    if (!isRoot) {
      await assertMemberModelPermission(tmb.permission);
      const ownerTmbId = getModelOwnerTmbId(modelItem);
      if (ownerTmbId && ownerTmbId !== tmbId) {
        return Promise.reject(ModelErrEnum.unExist);
      }
    }
    targetTmbId = getModelOwnerTmbId(modelItem) || tmbId;
  } else {
    await authSystemAdmin({ req });
  }

  const channelItems =
    isTeam && targetTmbId
      ? await getMemberChannelSummaryItems(targetTmbId)
      : await getSystemChannelSummaryItems();

  // 详情一次返回完整参数和渠道关系，避免编辑弹窗依赖列表快照或再次查询渠道。
  return GetModelDetailResponseSchema.parse({
    model: modelItem,
    channels: channelItems.map((channel) => ({
      ...channel.summary,
      isAssociated: channel.models.includes(modelItem.model)
    }))
  });
}

export default NextAPI(handler);
