import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createUsage, concatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { TTSModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';

export const pushGenerateVectorUsage = ({
  usageId,
  teamId,
  tmbId,
  inputTokens,
  model,
  source = UsageSourceEnum.fastgpt,
  extensionModel,
  extensionInputTokens,
  extensionOutputTokens
}: {
  usageId?: string;
  teamId: string;
  tmbId: string;
  inputTokens: number;
  model: AIModelDataType;
  source?: UsageSourceEnum;

  extensionModel?: AIModelDataType;
  extensionInputTokens?: number;
  extensionOutputTokens?: number;
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
  const totalPoints = totalVector + extensionTotalPoints;

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
  model: AIModelDataType;
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
  model: TTSModelDataType;
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
