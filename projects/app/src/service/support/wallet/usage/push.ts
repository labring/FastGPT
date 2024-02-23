import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { ModelTypeEnum } from '@/service/core/ai/model';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import { createUsage, concatUsage } from './controller';
import { formatModelChars2Points } from '@/service/support/wallet/usage/utils';
import { ChatModuleBillType } from '@fastgpt/global/support/wallet/bill/type';

export const pushChatUsage = ({
  appName,
  appId,
  teamId,
  tmbId,
  source,
  moduleDispatchBills
}: {
  appName: string;
  appId: string;
  teamId: string;
  tmbId: string;
  source: `${UsageSourceEnum}`;
  moduleDispatchBills: ChatModuleBillType[];
}) => {
  const totalPoints = moduleDispatchBills.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  createUsage({
    teamId,
    tmbId,
    appName,
    appId,
    totalPoints,
    source,
    list: moduleDispatchBills.map((item) => ({
      moduleName: item.moduleName,
      amount: item.totalPoints || 0,
      model: item.model,
      charsLength: item.charsLength
    }))
  });
  addLog.info(`finish completions`, {
    source,
    teamId,
    tmbId,
    totalPoints
  });
  return { totalPoints };
};

export const pushQAUsage = async ({
  teamId,
  tmbId,
  model,
  charsLength,
  billId
}: {
  teamId: string;
  tmbId: string;
  model: string;
  charsLength: number;
  billId: string;
}) => {
  // 计算价格
  const { totalPoints } = formatModelChars2Points({
    model,
    modelType: ModelTypeEnum.llm,
    charsLength
  });

  concatUsage({
    billId,
    teamId,
    tmbId,
    totalPoints,
    charsLength,
    listIndex: 1
  });

  return { totalPoints };
};

export const pushGenerateVectorUsage = ({
  billId,
  teamId,
  tmbId,
  charsLength,
  model,
  source = UsageSourceEnum.fastgpt,
  extensionModel,
  extensionCharsLength
}: {
  billId?: string;
  teamId: string;
  tmbId: string;
  charsLength: number;
  model: string;
  source?: `${UsageSourceEnum}`;

  extensionModel?: string;
  extensionCharsLength?: number;
}) => {
  const { totalPoints: totalVector, modelName: vectorModelName } = formatModelChars2Points({
    modelType: ModelTypeEnum.vector,
    model,
    charsLength
  });

  const { extensionTotalPoints, extensionModelName } = (() => {
    if (!extensionModel || !extensionCharsLength)
      return {
        extensionTotalPoints: 0,
        extensionModelName: ''
      };
    const { totalPoints, modelName } = formatModelChars2Points({
      modelType: ModelTypeEnum.llm,
      model: extensionModel,
      charsLength: extensionCharsLength
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
      charsLength,
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
          charsLength
        },
        ...(extensionModel !== undefined
          ? [
              {
                moduleName: 'core.module.template.Query extension',
                amount: extensionTotalPoints,
                model: extensionModelName,
                charsLength: extensionCharsLength
              }
            ]
          : [])
      ]
    });
  }
  return { totalPoints };
};

export const pushQuestionGuideUsage = ({
  charsLength,
  teamId,
  tmbId
}: {
  charsLength: number;
  teamId: string;
  tmbId: string;
}) => {
  const qgModel = global.llmModels[0];
  const { totalPoints, modelName } = formatModelChars2Points({
    charsLength,
    model: qgModel.model,
    modelType: ModelTypeEnum.llm
  });

  createUsage({
    teamId,
    tmbId,
    appName: 'core.app.Next Step Guide',
    totalPoints,
    source: UsageSourceEnum.fastgpt,
    list: [
      {
        moduleName: 'core.app.Next Step Guide',
        amount: totalPoints,
        model: modelName,
        charsLength
      }
    ]
  });
};

export function pushAudioSpeechUsage({
  appName = 'support.wallet.bill.Audio Speech',
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
  source: `${UsageSourceEnum}`;
}) {
  const { totalPoints, modelName } = formatModelChars2Points({
    model,
    charsLength,
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
    charsLength: duration,
    modelType: ModelTypeEnum.whisper,
    multiple: 60
  });

  const name = 'support.wallet.bill.Whisper';

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
