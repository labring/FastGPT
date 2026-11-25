import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import { mergeChannelTemplateModelData } from '@fastgpt/global/core/ai/model/utils';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/model/provider';
import type {
  ImportPreviewCandidate,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { AiproxyChannelModel } from '../../../thirdProvider/aiproxy/type';

/** 仅当渠道协议名唯一匹配 FastGPT provider 展示名时返回稳定 provider ID。 */
export const inferFastGPTProvider = ({
  channelTypeName,
  providers
}: {
  channelTypeName?: string;
  providers: Array<Pick<ModelProviderItemType, 'id' | 'name'>>;
}): string | undefined => {
  const normalizedName = channelTypeName?.trim().toLowerCase();
  if (!normalizedName) return;

  const providerIds = new Set(
    providers.filter(({ name }) => name.trim().toLowerCase() === normalizedName).map(({ id }) => id)
  );
  return providerIds.size === 1 ? providerIds.values().next().value : undefined;
};

const modalityModelTypes: ReadonlyMap<string, ModelTypeEnum> = new Map([
  ['text', ModelTypeEnum.llm],
  ['rerank', ModelTypeEnum.rerank],
  ['audio', ModelTypeEnum.tts],
  ['embedding', ModelTypeEnum.embedding],
  ['embeddings', ModelTypeEnum.embedding],
  ['speech', ModelTypeEnum.tts],
  ['transcription', ModelTypeEnum.stt]
]);

const getContextLength = (model: AiproxyChannelModel): number | undefined => {
  for (const contextLength of [model.context_length, model.top_provider?.context_length]) {
    if (
      typeof contextLength === 'number' &&
      Number.isInteger(contextLength) &&
      contextLength >= 0
    ) {
      return contextLength;
    }
  }
};

const getMaxCompletionTokens = (model: AiproxyChannelModel): number | undefined => {
  const value = model.top_provider?.max_completion_tokens;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
};

/**
 * 从 OpenRouter output_modalities 推断唯一的 FastGPT 模型类型；图片与未知模态不参与推断。
 */
export const inferChannelModelType = (modalities?: string[]): ModelTypeEnum | undefined => {
  const types = new Set(
    (modalities ?? []).flatMap((modality) => {
      const type = modalityModelTypes.get(modality);
      return type === undefined ? [] : [type];
    })
  );
  return types.size === 1 ? [...types][0] : undefined;
};

/** 保留模板自身标识与价格；上游限制仅在有效值存在时覆盖模板字段。 */
export const mergeTemplateModelData = (
  template: AIModelDocumentDataType,
  channelModel: AiproxyChannelModel
): AIModelDocumentDataType =>
  mergeChannelTemplateModelData({
    template,
    contextLength: getContextLength(channelModel),
    maxCompletionTokens: getMaxCompletionTokens(channelModel)
  });

/** 生成空白模型草稿；provider 仅在渠道协议名唯一匹配时传入。 */
export const createBlankModelData = (
  channelModel: AiproxyChannelModel,
  provider?: string
): Extract<ImportPreviewCandidate, { category: 'blank' }> => {
  const modelType = inferChannelModelType(channelModel.architecture?.output_modalities);
  const contextLength = getContextLength(channelModel);
  const maxResponse = getMaxCompletionTokens(channelModel);
  const base = {
    model: channelModel.id,
    name: channelModel.name?.trim() || channelModel.id,
    ...(provider ? { provider } : {})
  };

  const modelData = (() => {
    switch (modelType) {
      case ModelTypeEnum.llm:
        return {
          ...base,
          type: modelType,
          config: {
            ...(contextLength === undefined ? {} : { maxContext: contextLength }),
            ...(maxResponse === undefined ? {} : { maxResponse })
          }
        };
      case ModelTypeEnum.embedding:
        return {
          ...base,
          type: modelType,
          config: contextLength === undefined ? {} : { maxToken: contextLength }
        };
      case ModelTypeEnum.rerank:
        return {
          ...base,
          type: modelType,
          config: contextLength === undefined ? {} : { maxToken: contextLength }
        };
      case ModelTypeEnum.tts:
      case ModelTypeEnum.stt:
        return { ...base, type: modelType };
      default:
        return base;
    }
  })();

  return {
    category: 'blank',
    modelData
  };
};

/** 按已安装模型名和目标渠道的显式映射精确排除，余下的模型匹配模板或生成空白草稿。 */
export const classifyChannelModels = ({
  channelModels,
  installedModelNames,
  targetChannelModels,
  targetModelMappings,
  templates,
  provider
}: {
  channelModels: AiproxyChannelModel[];
  installedModelNames: string[];
  targetChannelModels: string[];
  targetModelMappings: Record<string, string>;
  templates: AIModelDocumentDataType[];
  provider?: string;
}): PreviewImportFromChannelResponse['items'] => {
  const getTemplateMatchRank = (providerModelSlug: string, model: string) => {
    if (!model) return;
    if (providerModelSlug === model) return 0;
    if (providerModelSlug.endsWith(model)) return 1;
    if (providerModelSlug.startsWith(model)) return 2;
    if (providerModelSlug.includes(model)) return 3;
  };

  // 只有仍然安装且绑定到目标渠道的模型，才能通过显式映射确认上游 ID。
  const installedNames = new Set(installedModelNames);
  const seenUpstreamIds = new Set(installedNames);
  for (const model of targetChannelModels) {
    if (installedNames.has(model) && Object.hasOwn(targetModelMappings, model)) {
      seenUpstreamIds.add(targetModelMappings[model]);
    }
  }

  // 保留未配置的上游 ID 首次出现的记录，确保预览选择和导入结果共用唯一标识。
  return channelModels.flatMap((channelModel) => {
    if (seenUpstreamIds.has(channelModel.id)) return [];
    seenUpstreamIds.add(channelModel.id);

    const contextLength = getContextLength(channelModel);
    const maxCompletionTokens = getMaxCompletionTokens(channelModel);
    const rowData = {
      providerModelSlug: channelModel.id,
      ...(contextLength === undefined ? {} : { contextLength }),
      ...(maxCompletionTokens === undefined ? {} : { maxCompletionTokens })
    };
    let bestMatch: { template: AIModelDocumentDataType; rank: number } | undefined;
    for (const template of templates) {
      const rank = getTemplateMatchRank(channelModel.id, template.model);
      if (rank !== undefined && (bestMatch === undefined || rank < bestMatch.rank)) {
        bestMatch = { template, rank };
      }
    }
    const blankDraft = createBlankModelData(channelModel, provider);
    if (!bestMatch) return { ...rowData, candidate: blankDraft };

    const { template } = bestMatch;
    return {
      ...rowData,
      candidate: {
        category: 'template',
        template: { type: template.type, model: template.model },
        modelData: mergeTemplateModelData(template, channelModel),
        blankModelData: blankDraft.modelData
      }
    };
  });
};
