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

  return GetAdminSystemModelListResponseSchema.parse({
    models: global.systemModelList.map((model) => ({
      ...desensitizeSystemModel(model),
      channels: channelItems
        .filter((channel) => channel.models.includes(model.model))
        .map((channel) => channel.summary)
    })),
    channels: channelItems.map((channel) => channel.summary),
    providers: global.ModelProviderRawCache,
    defaultModelIds: global.systemConfiguredDefaultModelIds,
    aiproxyChannels: global.aiproxyChannelsCache
  });
}

export default NextAPI(handler);
