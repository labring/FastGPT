import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { sortModelOrderItems } from '@fastgpt/global/core/ai/model/order';
import {
  GetModelDetailResponseSchema,
  GetSystemModelConfigResponseSchema,
  GetTeamModelsResponseSchema,
  type GetModelDetailResponse,
  type GetSystemModelConfigResponse,
  type GetTeamModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getSystemModelHandle, getTeamModelHandle } from './catalog/service';
import {
  getMemberChannelSummaryItems,
  getSystemChannelSummaryItems,
  groupChannelSummariesByModel
} from './channel/summary';
import { getModelProviderMetadata } from './provider/controller';
import { formatDbModelToRuntimeModel } from './runtime';
import { MongoAIModel } from './schema';
import { desensitizeModel } from './transform';
import { assertModelPriceTiersBackfilled } from './utils';

/** 聚合管理员视角系统模型、渠道、Provider 与默认模型配置。 */
export const getSystemModelConfigService = async (): Promise<GetSystemModelConfigResponse> => {
  const channelItems = await getSystemChannelSummaryItems();
  const channelsByModel = groupChannelSummariesByModel(channelItems);
  const modelHandle = await getSystemModelHandle();
  const metadata = getModelProviderMetadata();

  return GetSystemModelConfigResponseSchema.parse({
    models: sortModelOrderItems(modelHandle.getSystemModels()).map((model) => ({
      ...desensitizeModel(model),
      channels: channelsByModel.get(model.model) ?? []
    })),
    channels: channelItems.map((channel) => channel.summary),
    providers: metadata.providers,
    defaultModelIds: modelHandle.configuredDefaultModelIds
  });
};

/** 聚合成员视角团队私有模型及其关联渠道。 */
export const getTeamModelListService = async ({
  tmbId,
  teamId
}: {
  tmbId: string;
  teamId: string;
}): Promise<GetTeamModelsResponse> => {
  const channelItems = await getMemberChannelSummaryItems(tmbId);
  const channelsByModel = groupChannelSummariesByModel(channelItems);
  const metadata = getModelProviderMetadata();
  const handle = await getTeamModelHandle({ teamId });
  const teamModels = sortModelOrderItems(handle.getTeamModels(tmbId));

  return GetTeamModelsResponseSchema.parse({
    models: teamModels.map((item) => ({
      ...desensitizeModel(item),
      channels: channelsByModel.get(item.model) ?? []
    })),
    channels: channelItems.map((channel) => channel.summary),
    providers: metadata.providers
  });
};

/**
 * 聚合单个模型的完整参数与所在桶内的渠道关联关系。
 * ownerTmbId 为空表示系统模型桶；一次返回完整数据，避免编辑弹窗依赖列表快照或再次查询渠道。
 */
export const getModelDetailService = async ({
  model,
  ownerTmbId
}: {
  model: AIModelDataType;
  ownerTmbId?: string;
}): Promise<GetModelDetailResponse> => {
  const editableModel = await (async () => {
    if (model.scope !== ModelScopeEnum.system || model.type !== ModelTypeEnum.llm) return model;

    // 用同一份库内快照校验并生成编辑表单，防止回填完成后仍返回旧目录中的无限首档。
    const storedModel = await MongoAIModel.findOne({
      _id: model.modelId,
      scope: ModelScopeEnum.system,
      type: ModelTypeEnum.llm
    }).lean();
    if (!storedModel) throw new UserError(ModelErrEnum.unExist);
    assertModelPriceTiersBackfilled([storedModel]);
    return formatDbModelToRuntimeModel(storedModel);
  })();

  const channelItems = ownerTmbId
    ? await getMemberChannelSummaryItems(ownerTmbId)
    : await getSystemChannelSummaryItems();

  return GetModelDetailResponseSchema.parse({
    model: editableModel,
    channels: channelItems.map((channel) => ({
      ...channel.summary,
      isAssociated: channel.models.includes(editableModel.model)
    }))
  });
};
