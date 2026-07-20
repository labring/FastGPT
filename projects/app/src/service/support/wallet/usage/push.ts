import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createUsage, concatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getModelById } from '@fastgpt/service/core/ai/model/cache';
import type { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';

export const pushGenerateVectorUsage = ({
  usageId,
  teamId,
  tmbId,
  inputTokens,
  modelId,
  source = UsageSourceEnum.fastgpt,
  extensionModelId,
  extensionInputTokens,
  extensionOutputTokens,
  deepSearchModelId,
  deepSearchInputTokens,
  deepSearchOutputTokens
}: {
  usageId?: string;
  teamId: string;
  tmbId: string;
  inputTokens: number;
  modelId: string;
  source?: UsageSourceEnum;

  extensionModelId?: string;
  extensionInputTokens?: number;
  extensionOutputTokens?: number;

  deepSearchModelId?: string;
  deepSearchInputTokens?: number;
  deepSearchOutputTokens?: number;
}) => {
  const modelData = getModelById(modelId);
  const vectorResult = modelData
    ? formatModelChars2Points({ modelData, inputTokens })
    : { totalPoints: 0, modelName: '' };
  const { totalPoints: totalVector, modelName: vectorModelName } = vectorResult;

  const { extensionTotalPoints, extensionModelName } = (() => {
    if (!extensionModelId || !extensionInputTokens)
      return {
        extensionTotalPoints: 0,
        extensionModelName: ''
      };
    const extModelData = getModelById(extensionModelId);
    if (!extModelData) return { extensionTotalPoints: 0, extensionModelName: '' };
    const { totalPoints, modelName } = formatModelChars2Points({
      modelData: extModelData,
      inputTokens: extensionInputTokens,
      outputTokens: extensionOutputTokens
    });
    return {
      extensionTotalPoints: totalPoints,
      extensionModelName: modelName
    };
  })();
  const { deepSearchTotalPoints, deepSearchModelName } = (() => {
    if (!deepSearchModelId || !deepSearchInputTokens)
      return {
        deepSearchTotalPoints: 0,
        deepSearchModelName: ''
      };
    const dsModelData = getModelById(deepSearchModelId);
    if (!dsModelData) return { deepSearchTotalPoints: 0, deepSearchModelName: '' };
    const { totalPoints, modelName } = formatModelChars2Points({
      modelData: dsModelData,
      inputTokens: deepSearchInputTokens,
      outputTokens: deepSearchOutputTokens
    });
    return {
      deepSearchTotalPoints: totalPoints,
      deepSearchModelName: modelName
    };
  })();

  const totalPoints = totalVector + extensionTotalPoints + deepSearchTotalPoints;

  // 插入 Bill 记录
  if (usageId) {
    concatUsage({
      teamId,
      totalPoints,
      usageId,
      modelId,
      inputTokens,
      itemType: UsageItemTypeEnum.training_vector
    });
  } else {
    createUsage({
      teamId,
      tmbId,
      appName: i18nT('account_usage:embedding_index'),
      totalPoints,
      source,
      list: [
        {
          moduleName: i18nT('account_usage:embedding_index'),
          amount: totalVector,
          modelId: modelId,
          model: vectorModelName,
          inputTokens
        },
        ...(extensionModelId !== undefined
          ? [
              {
                moduleName: i18nT('common:core.module.template.Query extension'),
                amount: extensionTotalPoints,
                modelId: extensionModelId,
                model: extensionModelName,
                inputTokens: extensionInputTokens,
                outputTokens: extensionOutputTokens
              }
            ]
          : []),
        ...(deepSearchModelId !== undefined
          ? [
              {
                moduleName: i18nT('common:deep_rag_search'),
                amount: deepSearchTotalPoints,
                modelId: deepSearchModelId,
                model: deepSearchModelName,
                inputTokens: deepSearchInputTokens,
                outputTokens: deepSearchOutputTokens
              }
            ]
          : [])
      ]
    });
  }
  return { totalPoints };
};

export const pushQuestionGuideUsage = ({
  modelId,
  inputTokens,
  outputTokens,
  teamId,
  tmbId
}: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  teamId: string;
  tmbId: string;
}) => {
  const modelData = getModelById(modelId);
  const { totalPoints, modelName } = modelData
    ? formatModelChars2Points({ modelData, inputTokens, outputTokens })
    : { totalPoints: 0, modelName: '' };

  createUsage({
    teamId,
    tmbId,
    appName: i18nT('common:core.app.Question Guide'),
    totalPoints,
    source: UsageSourceEnum.fastgpt,
    list: [
      {
        moduleName: i18nT('common:core.app.Question Guide'),
        amount: totalPoints,
        modelId,
        model: modelName,
        inputTokens,
        outputTokens
      }
    ]
  });
};

export const pushAudioSpeechUsage = ({
  appName = i18nT('common:support.wallet.usage.Audio Speech'),
  modelId,
  charsLength,
  teamId,
  tmbId,
  source = UsageSourceEnum.fastgpt
}: {
  appName?: string;
  modelId: string;
  charsLength: number;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
}) => {
  const modelData = getModelById(modelId);
  const { totalPoints, modelName } = modelData
    ? formatModelChars2Points({ modelData, inputTokens: charsLength })
    : { totalPoints: 0, modelName: '' };

  createUsage({
    teamId,
    tmbId,
    appName,
    totalPoints,
    source,
    list: [
      {
        moduleName: appName,
        amount: totalPoints,
        modelId,
        model: modelName,
        charsLength
      }
    ]
  });
};

export const pushDatasetTestUsage = ({
  teamId,
  tmbId,
  source = UsageSourceEnum.fastgpt,
  embUsage,
  rerankUsage,
  extensionUsage,
  imageCaptionUsage
}: {
  teamId: string;
  tmbId: string;
  source?: UsageSourceEnum;
  embUsage?: {
    modelId: string;
    model: string;
    inputTokens: number;
  };
  rerankUsage?: {
    modelId: string;
    model: string;
    inputTokens: number;
  };
  extensionUsage?: {
    modelId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    embeddingTokens: number;
    embeddingModelId: string;
    embeddingModel: string;
  };
  imageCaptionUsage?: {
    modelId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
}) => {
  const list: UsageItemType[] = [];
  let points = 0;

  if (extensionUsage) {
    const extModelData = getModelById(extensionUsage.modelId);
    const llmResult = extModelData
      ? formatModelChars2Points({
          modelData: extModelData,
          inputTokens: extensionUsage.inputTokens,
          outputTokens: extensionUsage.outputTokens
        })
      : { totalPoints: 0, modelName: '' };
    const { totalPoints: llmPoints, modelName: llmModelName } = llmResult;
    points += llmPoints;
    list.push({
      moduleName: i18nT('common:core.module.template.Query extension'),
      amount: llmPoints,
      modelId: extensionUsage.modelId,
      model: llmModelName,
      inputTokens: extensionUsage.inputTokens,
      outputTokens: extensionUsage.outputTokens
    });

    const embModelData = getModelById(extensionUsage.embeddingModelId);
    const embResult = embModelData
      ? formatModelChars2Points({
          modelData: embModelData,
          inputTokens: extensionUsage.embeddingTokens
        })
      : { totalPoints: 0, modelName: '' };
    const { totalPoints: embeddingPoints, modelName: embeddingModelName } = embResult;
    points += embeddingPoints;
    list.push({
      moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
      amount: embeddingPoints,
      modelId: extensionUsage.embeddingModelId,
      model: embeddingModelName,
      inputTokens: extensionUsage.embeddingTokens
    });
  }
  if (embUsage) {
    const embModelData = getModelById(embUsage.modelId);
    const result = embModelData
      ? formatModelChars2Points({
          modelData: embModelData,
          inputTokens: embUsage.inputTokens
        })
      : { totalPoints: 0, modelName: '' };
    const { totalPoints, modelName } = result;
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:embedding_index'),
      amount: totalPoints,
      modelId: embUsage.modelId,
      model: modelName,
      inputTokens: embUsage.inputTokens
    });
  }
  if (rerankUsage) {
    const rerankModelData = getModelById(rerankUsage.modelId);
    const result = rerankModelData
      ? formatModelChars2Points({
          modelData: rerankModelData,
          inputTokens: rerankUsage.inputTokens
        })
      : { totalPoints: 0, modelName: '' };
    const { totalPoints, modelName } = result;
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:rerank'),
      amount: totalPoints,
      modelId: rerankUsage.modelId,
      model: modelName,
      inputTokens: rerankUsage.inputTokens
    });
  }
  if (imageCaptionUsage) {
    const imgModelData = getModelById(imageCaptionUsage.modelId);
    const result = imgModelData
      ? formatModelChars2Points({
          modelData: imgModelData,
          inputTokens: imageCaptionUsage.inputTokens,
          outputTokens: imageCaptionUsage.outputTokens
        })
      : { totalPoints: 0, modelName: '' };
    const { totalPoints, modelName } = result;
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:image_parse'),
      amount: totalPoints,
      modelId: imageCaptionUsage.modelId,
      model: modelName,
      inputTokens: imageCaptionUsage.inputTokens,
      outputTokens: imageCaptionUsage.outputTokens
    });
  }

  createUsage({
    teamId,
    tmbId,
    appName: i18nT('account_usage:search_test'),
    totalPoints: points,
    source,
    list
  });

  return { totalPoints: points };
};
