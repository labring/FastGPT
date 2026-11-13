import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import { mergeChannelTemplateModelData } from '@fastgpt/global/core/ai/model/utils';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/model/provider';
import type {
  ImportPreviewItem,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { AiproxyChannelModel } from '../../../thirdProvider/aiproxy/type';

type LocalModel = Pick<AIModelDocumentDataType, 'model'> & { modelId: string };
type LocalMatchCategory = Extract<ImportPreviewItem, { modelId: string }>['category'];

type ModelMatch =
  | {
      key: string;
      model: string;
      category: LocalMatchCategory;
      modelId: string;
      rank: number;
    }
  | {
      key: string;
      model: string;
      category: 'template';
      template: { type: AIModelDocumentDataType['type']; model: string };
      templateData: AIModelDocumentDataType;
      rank: number;
    };

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
  ['embedding', ModelTypeEnum.embedding]
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
): Extract<ImportPreviewItem, { category: 'blank' }> => {
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
        return { ...base, type: modelType };
      default:
        return base;
    }
  })();

  return {
    category: 'blank',
    ...(modelType === undefined ? {} : { modelType }),
    ...(contextLength === undefined ? {} : { contextLength }),
    modelData
  };
};

/** 优先分配目标渠道显式别名和唯一精确/后缀模型；其他上游项匹配模板或空白草稿。 */
export const classifyChannelModels = ({
  channelModels,
  localModels,
  targetChannelModels,
  targetModelMappings,
  otherChannelModels,
  templates,
  provider
}: {
  channelModels: AiproxyChannelModel[];
  localModels: LocalModel[];
  targetChannelModels: string[];
  targetModelMappings: Record<string, string>;
  otherChannelModels: string[];
  templates: AIModelDocumentDataType[];
  provider?: string;
}): PreviewImportFromChannelResponse['items'] => {
  const getLocalModelMatchRank = (providerModelSlug: string, model: string) => {
    if (!model) return;
    if (providerModelSlug === model) return 0;
    if (providerModelSlug.endsWith(model)) return 1;
  };
  const getTemplateMatchRank = (providerModelSlug: string, model: string) => {
    if (!model) return;
    if (providerModelSlug === model) return 0;
    if (providerModelSlug.endsWith(model)) return 1;
    if (providerModelSlug.startsWith(model)) return 2;
    if (providerModelSlug.includes(model)) return 3;
  };

  const targetModelNames = new Set(targetChannelModels);
  const otherModelNames = new Set(otherChannelModels);
  const localMatches = channelModels.flatMap((channelModel, channelModelIndex) =>
    localModels.flatMap(({ modelId, model }) => {
      const category: LocalMatchCategory = targetModelNames.has(model) ? 'associated' : 'existing';
      const mappedSlug = category === 'associated' ? targetModelMappings[model] : undefined;

      // 其他渠道占用的模型不跨渠道复用；目标渠道的显式映射优先于名称推断。
      if (category === 'existing' && otherModelNames.has(model) && channelModel.id !== model) {
        return [];
      }

      const rank =
        mappedSlug === undefined
          ? getLocalModelMatchRank(channelModel.id, model)
          : mappedSlug === channelModel.id
            ? -1
            : undefined;
      if (rank === undefined) return [];

      return [{ channelModelIndex, key: `model:${modelId}`, model, category, modelId, rank }];
    })
  );
  const localMatchByChannelModelIndex = new Map<number, (typeof localMatches)[number]>();
  const matchedLocalModelIds = new Set<string>();

  // 显式别名、精确和更长后缀优先；同精度按上游目录顺序稳定分配。
  for (const match of localMatches.sort(
    (left, right) =>
      left.rank - right.rank ||
      right.model.length - left.model.length ||
      left.channelModelIndex - right.channelModelIndex
  )) {
    if (
      matchedLocalModelIds.has(match.modelId) ||
      localMatchByChannelModelIndex.has(match.channelModelIndex)
    ) {
      continue;
    }
    matchedLocalModelIds.add(match.modelId);
    localMatchByChannelModelIndex.set(match.channelModelIndex, match);
  }

  return channelModels.map((channelModel, channelModelIndex) => {
    const contextLength = getContextLength(channelModel);
    const maxCompletionTokens = getMaxCompletionTokens(channelModel);
    const rowData = {
      providerModelSlug: channelModel.id,
      ...(contextLength === undefined ? {} : { contextLength }),
      ...(maxCompletionTokens === undefined ? {} : { maxCompletionTokens })
    };
    const localMatch = localMatchByChannelModelIndex.get(channelModelIndex);
    if (localMatch) {
      return {
        ...rowData,
        candidates: [{ category: localMatch.category, modelId: localMatch.modelId }]
      };
    }

    const matches: ModelMatch[] = [];
    templates.forEach((template) => {
      const rank = getTemplateMatchRank(channelModel.id, template.model);
      if (rank !== undefined) {
        matches.push({
          key: `template:${template.type}:${template.model}`,
          model: template.model,
          category: 'template',
          template: { type: template.type, model: template.model },
          templateData: template,
          rank
        });
      }
    });
    const orderedMatches = [...new Map(matches.map((match) => [match.key, match])).values()].sort(
      (left, right) => left.rank - right.rank
    );
    const blankDraft = orderedMatches.some((match) => match.category === 'template')
      ? createBlankModelData(channelModel, provider)
      : undefined;
    const candidates: ImportPreviewItem[] = orderedMatches.length
      ? orderedMatches.map((match) => {
          if (match.category !== 'template') {
            return { category: match.category, modelId: match.modelId };
          }
          return {
            category: 'template',
            template: match.template,
            modelData: mergeTemplateModelData(match.templateData, channelModel),
            ...(blankDraft?.contextLength === undefined
              ? {}
              : { contextLength: blankDraft.contextLength }),
            ...(blankDraft?.modelData === undefined ? {} : { blankModelData: blankDraft.modelData })
          };
        })
      : [createBlankModelData(channelModel, provider)];

    return { ...rowData, candidates };
  });
};
