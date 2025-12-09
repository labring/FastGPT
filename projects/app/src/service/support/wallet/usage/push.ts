import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createUsage, concatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getDefaultTTSModel } from '@fastgpt/service/core/ai/model';
import type { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';

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
  model: string;
  source?: UsageSourceEnum;

  extensionModel?: string;
  extensionInputTokens?: number;
  extensionOutputTokens?: number;

  deepSearchModel?: string;
  deepSearchInputTokens?: number;
  deepSearchOutputTokens?: number;
}) => {
  const { totalPoints: totalVector, modelName: vectorModelName } = formatModelChars2Points({
    model,
    inputTokens
  });

  const { extensionTotalPoints, extensionModelName } = (() => {
    if (!extensionModel || !extensionInputTokens)
      return {
        extensionTotalPoints: 0,
        extensionModelName: ''
      };
    const { totalPoints, modelName } = formatModelChars2Points({
      model: extensionModel,
      inputTokens: extensionInputTokens,
      outputTokens: extensionOutputTokens
    });
    return {
      extensionTotalPoints: totalPoints,
      extensionModelName: modelName
    };
  })();
  const { deepSearchTotalPoints, deepSearchModelName } = (() => {
    if (!deepSearchModel || !deepSearchInputTokens)
      return {
        deepSearchTotalPoints: 0,
        deepSearchModelName: ''
      };
    const { totalPoints, modelName } = formatModelChars2Points({
      model: deepSearchModel,
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
          model: vectorModelName,
          inputTokens
        },
        ...(extensionModel !== undefined
          ? [
              {
                moduleName: i18nT('common:core.module.template.Query extension'),
                amount: extensionTotalPoints,
                model: extensionModelName,
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
  model,
  inputTokens,
  outputTokens,
  teamId,
  tmbId
}: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  teamId: string;
  tmbId: string;
}) => {
  const { totalPoints, modelName } = formatModelChars2Points({
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
        model: modelName,
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
  model: string;
  charsLength: number;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
}) => {
  const { totalPoints, modelName } = formatModelChars2Points({
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
        model: modelName,
        charsLength
      }
    ]
  });
};

export const pushWhisperUsage = ({
  teamId,
  tmbId,
  duration
}: {
  teamId: string;
  tmbId: string;
  duration: number;
}) => {
  const whisperModel = getDefaultTTSModel();

  if (!whisperModel) return;

  const { totalPoints, modelName } = formatModelChars2Points({
    model: whisperModel.model,
    inputTokens: duration,
    multiple: 60
  });

  const name = i18nT('common:support.wallet.usage.Whisper');

  createUsage({
    teamId,
    tmbId,
    appName: name,
    totalPoints,
    source: UsageSourceEnum.fastgpt,
    list: [
      {
        moduleName: name,
        amount: totalPoints,
        model: modelName,
        duration
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
  extensionUsage
}: {
  teamId: string;
  tmbId: string;
  source?: UsageSourceEnum;
  embUsage?: {
    model: string;
    inputTokens: number;
  };
  rerankUsage?: {
    model: string;
    inputTokens: number;
  };
  extensionUsage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    embeddingTokens: number;
    embeddingModel: string;
  };
}) => {
  const list: UsageItemType[] = [];
  let points = 0;

  if (extensionUsage) {
    const { totalPoints: llmPoints, modelName: llmModelName } = formatModelChars2Points({
      model: extensionUsage.model,
      inputTokens: extensionUsage.inputTokens,
      outputTokens: extensionUsage.outputTokens
    });
    points += llmPoints;
    list.push({
      moduleName: i18nT('common:core.module.template.Query extension'),
      amount: llmPoints,
      model: llmModelName,
      inputTokens: extensionUsage.inputTokens,
      outputTokens: extensionUsage.outputTokens
    });

    const { totalPoints: embeddingPoints, modelName: embeddingModelName } = formatModelChars2Points(
      {
        model: extensionUsage.embeddingModel,
        inputTokens: extensionUsage.embeddingTokens
      }
    );
    points += embeddingPoints;
    list.push({
      moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
      amount: embeddingPoints,
      model: embeddingModelName,
      inputTokens: extensionUsage.embeddingTokens
    });
  }
  if (embUsage) {
    const { totalPoints, modelName } = formatModelChars2Points({
      model: embUsage.model,
      inputTokens: embUsage.inputTokens
    });
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:embedding_index'),
      amount: totalPoints,
      model: modelName,
      inputTokens: embUsage.inputTokens
    });
  }
  if (rerankUsage) {
    const { totalPoints, modelName } = formatModelChars2Points({
      model: rerankUsage.model,
      inputTokens: rerankUsage.inputTokens
    });
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:rerank'),
      amount: totalPoints,
      model: modelName,
      inputTokens: rerankUsage.inputTokens
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
