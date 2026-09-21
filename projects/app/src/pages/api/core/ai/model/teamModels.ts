import { getModelProviderMetadata } from '@fastgpt/service/core/app/provider/controller';
import {
  getSystemGroupId,
  listAllGroupChannels,
  type AiproxyGroupChannel
} from '@fastgpt/service/core/ai/channel';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetTeamModelsResponseSchema,
  type GetTeamModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';

/** 获取当前成员所在团队的私有模型列表与关联团队渠道摘要 */
async function handler(req: ApiRequestProps): Promise<GetTeamModelsResponse> {
  const { tmbId } = await authUserPer({ req, authToken: true });

  const groupId = getSystemGroupId(tmbId);
  const groupChannels: AiproxyGroupChannel[] = await listAllGroupChannels(groupId).catch(() => []);

  const channelItems = groupChannels.map((channel: AiproxyGroupChannel) => ({
    summary: {
      id: channel.id,
      name: channel.name,
      protocol: {
        name: { en: channel.name, 'zh-CN': channel.name, 'zh-Hant': channel.name },
        avatar: 'model/openai'
      },
      status: channel.status
    },
    models: channel.models || []
  }));

  const channelsByModel = new Map<string, (typeof channelItems)[number]['summary'][]>();
  for (const channel of channelItems) {
    for (const model of new Set(channel.models)) {
      const modelStr = String(model);
      const summaries = channelsByModel.get(modelStr) ?? [];
      summaries.push(channel.summary);
      channelsByModel.set(modelStr, summaries);
    }
  }

  const metadata = getModelProviderMetadata();
  const providerMap = new Map(metadata.providers.map((p) => [p.provider, p]));

  const teamModels = await MongoAIModel.find({
    scope: ModelScopeEnum.team,
    tmbId
  })
    .sort({ _id: -1 })
    .lean();

  return GetTeamModelsResponseSchema.parse({
    models: teamModels.map((item) => {
      const provider = providerMap.get(item.provider);
      return {
        modelId: String(item._id),
        provider: item.provider,
        avatar: provider?.avatar || '',
        name: item.name,
        model: item.model,
        type: item.type,
        scope: ModelScopeEnum.team,
        isActive: item.isActive,
        tmbId: item.tmbId,
        charsPointsPrice: item.charsPointsPrice,
        priceTiers: item.priceTiers,
        inputPrice: item.inputPrice,
        outputPrice: item.outputPrice,
        config: item.config || {},
        channels: channelsByModel.get(item.model) ?? []
      };
    }),
    channels: channelItems.map((channel) => channel.summary),
    providers: metadata.providers
  });
}

export default NextAPI(handler);
