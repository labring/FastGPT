import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createUsage, concatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { getDefaultTTSModel } from '@fastgpt/service/core/ai/model';

export const pushGenerateVectorUsage = ({
  billId,
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
  billId?: string;
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
    modelType: ModelTypeEnum.embedding,
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
      modelType: ModelTypeEnum.llm,
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
      modelType: ModelTypeEnum.llm,
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
  if (billId) {
    concatUsage({
      teamId,
      tmbId,
      totalPoints,
      billId,
      inputTokens,
      listIndex: 0
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
    model,
    modelType: ModelTypeEnum.llm
  });

  createUsage({
    teamId,
    tmbId,
    appName: 'core.app.Question Guide',
    totalPoints,
    source: UsageSourceEnum.fastgpt,
    list: [
      {
        moduleName: 'core.app.Question Guide',
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
    inputTokens: charsLength,
    modelType: ModelTypeEnum.tts
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
    modelType: ModelTypeEnum.stt,
    multiple: 60
  });

  const name = 'support.wallet.usage.Whisper';

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

export const pushRerankUsage = ({
  teamId,
  tmbId,
  model,
  inputTokens,
  source = UsageSourceEnum.fastgpt
}: {
  teamId: string;
  tmbId: string;
  model: string;
  inputTokens: number;
  source?: UsageSourceEnum;
}) => {
  const { totalPoints, modelName } = formatModelChars2Points({
    model,
    inputTokens,
    modelType: ModelTypeEnum.rerank
  });

  createUsage({
    teamId,
    tmbId,
    appName: i18nT('account_bill:rerank'),
    totalPoints,
    source,
    list: [
      {
        moduleName: modelName,
        amount: totalPoints,
        model: modelName,
        inputTokens
      }
    ]
  });

  return { totalPoints };
};
