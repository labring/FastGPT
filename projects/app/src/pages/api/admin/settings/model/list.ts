import { getModelProviderMetadata } from '@fastgpt/service/core/app/provider/controller';
import { getModelHandle } from '@fastgpt/service/core/ai/model';

import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  GetAdminSystemModelListResponseSchema,
  type GetAdminSystemModelListResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { getAdminAIProxyChannelItems } from '@fastgpt/service/thirdProvider/aiproxy/channel';

async function handler(req: ApiRequestProps): Promise<GetAdminSystemModelListResponse> {
  await authSystemAdmin({ req });

  const channelItems = await getAdminAIProxyChannelItems();
  const channelsByModel = new Map<string, (typeof channelItems)[number]['summary'][]>();
  for (const channel of channelItems) {
    // 每条关系只遍历一次，同渠道重复 model 不应造成重复展示。
    for (const model of new Set(channel.models)) {
      const summaries = channelsByModel.get(model) ?? [];
      summaries.push(channel.summary);
      channelsByModel.set(model, summaries);
    }
  }
  const modelHandle = await getModelHandle();
  return GetAdminSystemModelListResponseSchema.parse({
    models: modelHandle.getAllModels().map((model) => ({
      ...desensitizeSystemModel(model),
      channels: channelsByModel.get(model.model) ?? []
    })),
    channels: channelItems.map((channel) => channel.summary),
    providers: getModelProviderMetadata().providers,
    defaultModelIds: modelHandle.configuredDefaultModelIds,
    aiproxyChannels: getModelProviderMetadata().aiproxyChannels
  });
}

export default NextAPI(handler);
