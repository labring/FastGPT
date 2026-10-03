import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  GetSystemModelConfigResponseSchema,
  GetTeamModelsResponseSchema,
  type GetSystemModelConfigResponse,
  type GetTeamModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getModelProviderMetadata } from '../provider/controller';
import {
  getMemberChannelSummaryItems,
  getSystemChannelSummaryItems,
  groupChannelSummariesByModel
} from '../channel/summary';
import { getModelHandle } from './index';
import { MongoAIModel } from './schema';
import { desensitizeSystemModel } from './transform';

/** 聚合管理员视角系统模型、渠道、Provider 与默认模型配置。 */
export const getSystemModelConfigService = async (): Promise<GetSystemModelConfigResponse> => {
  const channelItems = await getSystemChannelSummaryItems();
  const channelsByModel = groupChannelSummariesByModel(channelItems);
  const modelHandle = await getModelHandle();
  const metadata = getModelProviderMetadata();

  return GetSystemModelConfigResponseSchema.parse({
    models: modelHandle.getSystemModels().map((model) => ({
      ...desensitizeSystemModel(model),
      channels: channelsByModel.get(model.model) ?? []
    })),
    channels: channelItems.map((channel) => channel.summary),
    providers: metadata.providers,
    defaultModelIds: modelHandle.configuredDefaultModelIds,
    aiproxyChannels: metadata.aiproxyChannels
  });
};

/** 聚合成员视角团队私有模型及其关联渠道。 */
export const getTeamModelListService = async ({
  tmbId
}: {
  tmbId: string;
}): Promise<GetTeamModelsResponse> => {
  const channelItems = await getMemberChannelSummaryItems(tmbId);
  const channelsByModel = groupChannelSummariesByModel(channelItems);
  const metadata = getModelProviderMetadata();
  const providerMap = new Map(metadata.providers.map((provider) => [provider.provider, provider]));
  const teamModels = await MongoAIModel.find({ scope: ModelScopeEnum.team, tmbId })
    .sort({ _id: -1 })
    .lean();

  return GetTeamModelsResponseSchema.parse({
    models: teamModels.map((item) => {
      const provider = providerMap.get(item.provider);
      return {
        modelId: String(item._id),
        provider: item.provider,
        avatar: provider?.avatar ?? '',
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
        config: item.config ?? {},
        channels: channelsByModel.get(item.model) ?? []
      };
    }),
    channels: channelItems.map((channel) => channel.summary),
    providers: metadata.providers
  });
};
