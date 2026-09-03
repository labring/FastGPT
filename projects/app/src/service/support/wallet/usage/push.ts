import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createUsage, concatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import type { TTSSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

export const pushGenerateVectorUsage = ({
  usageId,
  teamId,
  tmbId,
  inputTokens,
  model,
  source = UsageSourceEnum.fastgpt,
  extensionModel,
  extensionInputTokens,
  extensionOutputTokens,
  deepSearchModel,
  deepSearchInputTokens,
  deepSearchOutputTokens
}: {
  usageId?: string;
  teamId: string;
  tmbId: string;
  inputTokens: number;
  model: SystemModelDataType;
  source?: UsageSourceEnum;

  extensionModel?: SystemModelDataType;
  extensionInputTokens?: number;
  extensionOutputTokens?: number;

  deepSearchModel?: SystemModelDataType;
  deepSearchInputTokens?: number;
  deepSearchOutputTokens?: number;
}) => {
  const { totalPoints: totalVector, modelId: vectorModelId } = formatModelChars2Points({
    model,
    inputTokens
  });

  const { extensionTotalPoints, extensionModelId } = (() => {
    if (!extensionModel || !extensionInputTokens)
      return {
        extensionTotalPoints: 0,
        extensionModelId: undefined
      };
    const { totalPoints, modelId } = formatModelChars2Points({
      model: extensionModel,
      inputTokens: extensionInputTokens,
      outputTokens: extensionOutputTokens
    });
    return {
      extensionTotalPoints: totalPoints,
      extensionModelId: modelId
    };
  })();
  const { deepSearchTotalPoints, deepSearchModelId } = (() => {
    if (!deepSearchModel || !deepSearchInputTokens)
      return {
        deepSearchTotalPoints: 0,
        deepSearchModelId: undefined
      };
    const { totalPoints, modelId } = formatModelChars2Points({
      model: deepSearchModel,
      inputTokens: deepSearchInputTokens,
      outputTokens: deepSearchOutputTokens
    });
    return {
      deepSearchTotalPoints: totalPoints,
      deepSearchModelId: modelId
    };
  })();

  const totalPoints = totalVector + extensionTotalPoints + deepSearchTotalPoints;

  // 插入 Bill 记录
  if (usageId) {
    concatUsage({
      teamId,
      totalPoints,
      usageId,
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
          modelId: vectorModelId,
          inputTokens
        },
        ...(extensionModel !== undefined
          ? [
              {
                moduleName: i18nT('common:core.module.template.Query extension'),
                amount: extensionTotalPoints,
                modelId: extensionModelId,
                inputTokens: extensionInputTokens,
                outputTokens: extensionOutputTokens
              }
            ]
          : []),
        ...(deepSearchModel !== undefined
          ? [
              {
                moduleName: i18nT('common:deep_rag_search'),
                amount: deepSearchTotalPoints,
                modelId: deepSearchModelId,
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
  model,
  inputTokens,
  outputTokens,
  teamId,
  tmbId
}: {
  model: SystemModelDataType;
  inputTokens: number;
  outputTokens: number;
  teamId: string;
  tmbId: string;
}) => {
  const { totalPoints, modelId } = formatModelChars2Points({
    inputTokens,
    outputTokens,
    model
  });

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
        inputTokens,
        outputTokens
      }
    ]
  });
};

export const pushAudioSpeechUsage = ({
  appName = i18nT('common:support.wallet.usage.Audio Speech'),
  model,
  charsLength,
  teamId,
  tmbId,
  source = UsageSourceEnum.fastgpt
}: {
  appName?: string;
  model: TTSSystemModelDataType;
  charsLength: number;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
}) => {
  const { totalPoints } = formatModelChars2Points({
    model,
    inputTokens: charsLength
  });

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
        modelId: model.modelId,
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
    model: SystemModelDataType;
    inputTokens: number;
  };
  rerankUsage?: {
    model: SystemModelDataType;
    inputTokens: number;
  };
  extensionUsage?: {
    model: SystemModelDataType;
    inputTokens: number;
    outputTokens: number;
    embeddingTokens: number;
    embeddingModel: SystemModelDataType;
  };
  imageCaptionUsage?: {
    model: SystemModelDataType;
    inputTokens: number;
    outputTokens: number;
  };
}) => {
  const list: UsageItemType[] = [];
  let points = 0;

  if (extensionUsage) {
    const { totalPoints: llmPoints, modelId: llmModelId } = formatModelChars2Points({
      model: extensionUsage.model,
      inputTokens: extensionUsage.inputTokens,
      outputTokens: extensionUsage.outputTokens
    });
    points += llmPoints;
    list.push({
      moduleName: i18nT('common:core.module.template.Query extension'),
      amount: llmPoints,
      modelId: llmModelId,
      inputTokens: extensionUsage.inputTokens,
      outputTokens: extensionUsage.outputTokens
    });

    const { totalPoints: embeddingPoints, modelId: embeddingModelId } = formatModelChars2Points({
      model: extensionUsage.embeddingModel,
      inputTokens: extensionUsage.embeddingTokens
    });
    points += embeddingPoints;
    list.push({
      moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
      amount: embeddingPoints,
      modelId: embeddingModelId,
      inputTokens: extensionUsage.embeddingTokens
    });
  }
  if (embUsage) {
    const { totalPoints, modelId } = formatModelChars2Points({
      model: embUsage.model,
      inputTokens: embUsage.inputTokens
    });
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:embedding_index'),
      amount: totalPoints,
      modelId,
      inputTokens: embUsage.inputTokens
    });
  }
  if (rerankUsage) {
    const { totalPoints, modelId } = formatModelChars2Points({
      model: rerankUsage.model,
      inputTokens: rerankUsage.inputTokens
    });
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:rerank'),
      amount: totalPoints,
      modelId,
      inputTokens: rerankUsage.inputTokens
    });
  }
  if (imageCaptionUsage) {
    const { totalPoints, modelId } = formatModelChars2Points({
      model: imageCaptionUsage.model,
      inputTokens: imageCaptionUsage.inputTokens,
      outputTokens: imageCaptionUsage.outputTokens
    });
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:image_parse'),
      amount: totalPoints,
      modelId,
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
