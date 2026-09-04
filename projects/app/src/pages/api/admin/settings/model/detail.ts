import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelData } from '@fastgpt/service/core/ai/model';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  GetAdminSystemModelDetailResponseSchema,
  type AdminSystemModelReference,
  type GetAdminSystemModelDetailResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getAdminAIProxyChannelItems } from '@fastgpt/service/thirdProvider/aiproxy/channel';

async function handler(
  req: ApiRequestProps<Record<string, never>, AdminSystemModelReference>
): Promise<GetAdminSystemModelDetailResponse> {
  await authSystemAdmin({ req });

  const reference = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;
  const modelItem = findModelData(reference);
  if (!modelItem) return Promise.reject(ModelErrEnum.unExist);

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
