import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { ModelTypeEnum } from '@fastgpt/service/core/ai/model';
import { addLog } from '@fastgpt/service/common/system/log';
import { createUsage, concatUsage } from './controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { i18nT } from '@fastgpt/web/i18n/utils';

export const pushChatUsage = ({
  appName,
  appId,
  pluginId,
  teamId,
  tmbId,
  source,
  flowUsages
}: {
  appName: string;
  appId?: string;
  pluginId?: string;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
  flowUsages: ChatNodeUsageType[];
}) => {
  const totalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  createUsage({
    teamId,
    tmbId,
    appName,
    appId,
    pluginId,
    totalPoints,
    source,
    list: flowUsages.map((item) => ({
      moduleName: item.moduleName,
      amount: item.totalPoints || 0,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens
    }))
  });
  addLog.info(`finish completions`, {
    source,
    teamId,
    totalPoints
  });
  return { totalPoints };
};

export const pushQAUsage = async ({
  teamId,
  tmbId,
  model,
  inputTokens,
  outputTokens,
  billId
}: {
  teamId: string;
  tmbId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  billId: string;
}) => {
  // 计算价格
  const { totalPoints } = formatModelChars2Points({
    model,
    modelType: ModelTypeEnum.llm,
    inputTokens,
    outputTokens
  });

  concatUsage({
    billId,
    teamId,
    tmbId,
    totalPoints,
    inputTokens,
    outputTokens,
    listIndex: 1
  });

  return { totalPoints };
};

export const pushGenerateVectorUsage = ({
  billId,
  teamId,
  tmbId,
  inputTokens,
  model,
  source = UsageSourceEnum.fastgpt,
  extensionModel,
  extensionInputTokens,
  extensionOutputTokens
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
}) => {
  const { totalPoints: totalVector, modelName: vectorModelName } = formatModelChars2Points({
    modelType: ModelTypeEnum.vector,
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

  const totalPoints = totalVector + extensionTotalPoints;

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
      appName: 'support.wallet.moduleName.index',
      totalPoints,
      source,
      list: [
        {
          moduleName: 'support.wallet.moduleName.index',
          amount: totalVector,
          model: vectorModelName,
          inputTokens
        },
        ...(extensionModel !== undefined
          ? [
              {
                moduleName: 'core.module.template.Query extension',
                amount: extensionTotalPoints,
                model: extensionModelName,
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
  inputTokens,
  outputTokens,
  teamId,
  tmbId
}: {
  inputTokens: number;
  outputTokens: number;
  teamId: string;
  tmbId: string;
}) => {
  const qgModel = global.llmModels[0];
  const { totalPoints, modelName } = formatModelChars2Points({
    inputTokens,
    outputTokens,
    model: qgModel.model,
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

export function pushAudioSpeechUsage({
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
}) {
  const { totalPoints, modelName } = formatModelChars2Points({
    model,
    inputTokens: charsLength,
    modelType: ModelTypeEnum.audioSpeech
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
}

export function pushWhisperUsage({
  teamId,
  tmbId,
  duration
}: {
  teamId: string;
  tmbId: string;
  duration: number;
}) {
  const whisperModel = global.whisperModel;

  if (!whisperModel) return;

  const { totalPoints, modelName } = formatModelChars2Points({
    model: whisperModel.model,
    inputTokens: duration,
    modelType: ModelTypeEnum.whisper,
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
}
