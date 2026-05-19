import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createUsage, concatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getDefaultTTSModel, getModelById } from '@fastgpt/service/core/ai/model';
import type { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import type { HelperBotTypeEnumType } from '@fastgpt/global/core/chat/helperBot/type';

export const pushHelperBotUsage = ({
  teamId,
  tmbId,
  modelId,
  inputTokens,
  outputTokens
}: {
  teamId: string;
  tmbId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}) => {
  const { totalPoints, modelName } = formatModelChars2Points({
    modelId,
    inputTokens,
    outputTokens
  });

  createUsage({
    teamId,
    tmbId,
    appName: i18nT('account_usage:helper_bot'),
    totalPoints,
    source: UsageSourceEnum.fastgpt,
    list: [
      {
        moduleName: i18nT('account_usage:helper_bot'),
        amount: totalPoints,
        modelId: modelId,
        inputTokens,
        outputTokens
      }
    ]
  });
};

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
  const { totalPoints: totalVector, modelName: vectorModelName } = formatModelChars2Points({
    modelId,
    inputTokens
  });

  const { extensionTotalPoints, extensionModelName } = (() => {
    if (!extensionModelId || !extensionInputTokens)
      return {
        extensionTotalPoints: 0,
        extensionModelName: ''
      };
    const { totalPoints, modelName } = formatModelChars2Points({
      modelId: extensionModelId,
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
    const { totalPoints, modelName } = formatModelChars2Points({
      modelId: deepSearchModelId,
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
          modelId: modelId,
          inputTokens
        },
        ...(extensionModelId !== undefined
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
        ...(deepSearchModelId !== undefined
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
  const { totalPoints, modelName } = formatModelChars2Points({
    inputTokens,
    outputTokens,
    modelId
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
        modelId: modelId,
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
  const { totalPoints, modelName } = formatModelChars2Points({
    modelId,
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
        modelId: modelId,
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
    modelId: whisperModel.id,
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
        modelId: whisperModel.id,
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
    modelId: string;
    inputTokens: number;
  };
  rerankUsage?: {
    modelId: string;
    inputTokens: number;
  };
  extensionUsage?: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    embeddingTokens: number;
    embeddingModelId: string;
  };
}) => {
  const list: UsageItemType[] = [];
  let points = 0;

  if (extensionUsage) {
    const { totalPoints: llmPoints } = formatModelChars2Points({
      modelId: extensionUsage.modelId,
      inputTokens: extensionUsage.inputTokens,
      outputTokens: extensionUsage.outputTokens
    });
    points += llmPoints;
    list.push({
      moduleName: i18nT('common:core.module.template.Query extension'),
      amount: llmPoints,
      modelId: extensionUsage.modelId,
      inputTokens: extensionUsage.inputTokens,
      outputTokens: extensionUsage.outputTokens
    });

    const { totalPoints: embeddingPoints } = formatModelChars2Points({
      modelId: extensionUsage.embeddingModelId,
      inputTokens: extensionUsage.embeddingTokens
    });
    points += embeddingPoints;
    list.push({
      moduleName: `${i18nT('account_usage:ai.query_extension_embedding')}`,
      amount: embeddingPoints,
      modelId: extensionUsage.embeddingModelId,
      inputTokens: extensionUsage.embeddingTokens
    });
  }
  if (embUsage) {
    const { totalPoints, modelName } = formatModelChars2Points({
      modelId: embUsage.modelId,
      inputTokens: embUsage.inputTokens
    });
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:embedding_index'),
      amount: totalPoints,
      modelId: embUsage.modelId,
      inputTokens: embUsage.inputTokens
    });
  }
  if (rerankUsage) {
    const { totalPoints, modelName } = formatModelChars2Points({
      modelId: rerankUsage.modelId,
      inputTokens: rerankUsage.inputTokens
    });
    points += totalPoints;
    list.push({
      moduleName: i18nT('account_usage:rerank'),
      amount: totalPoints,
      modelId: rerankUsage.modelId,
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

export const pushGenerateSqlUsage = ({
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
  const { totalPoints, modelName } = formatModelChars2Points({
    inputTokens,
    outputTokens,
    modelId
  });

  createUsage({
    teamId,
    tmbId,
    appName: i18nT('account_bill:generate_sql'),
    totalPoints,
    source: UsageSourceEnum.fastgpt,
    list: [
      {
        moduleName: 'core.app.Generate Sql',
        amount: totalPoints,
        modelId: modelId,
        inputTokens,
        outputTokens
      }
    ]
  });
  return { totalPoints };
};
