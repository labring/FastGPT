import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { ModelTypeEnum } from '@/service/core/ai/model';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { addLog } from '@fastgpt/service/common/system/log';
import { PostReRankProps } from '@fastgpt/global/core/ai/api';
import { createUsage, concatUsage } from './controller';
import { formatModelPrice2Store } from '@/service/support/wallet/usage/utils';

export const pushChatUsage = ({
  appName,
  appId,
  teamId,
  tmbId,
  source,
  response
}: {
  appName: string;
  appId: string;
  teamId: string;
  tmbId: string;
  source: `${UsageSourceEnum}`;
  response: ChatHistoryItemResType[];
}) => {
  const total = response.reduce((sum, item) => sum + (item.price || 0), 0);

  createUsage({
    teamId,
    tmbId,
    appName,
    appId,
    total,
    source,
    list: response.map((item) => ({
      moduleName: item.moduleName,
      amount: item.price || 0,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      charsLength: item.charsLength
    }))
  });
  addLog.info(`finish completions`, {
    source,
    teamId,
    tmbId,
    price: formatStorePrice2Read(total)
  });
  return { total };
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
  const { total } = formatModelPrice2Store({
    model,
    inputLen: charsLength,
    type: ModelTypeEnum.llm
  });

  concatUsage({
    billId,
    teamId,
    tmbId,
    total,
    charsLength,
    listIndex: 1
  });

  return { total };
};

export const pushGenerateVectorUsage = ({
  billId,
  teamId,
  tmbId,
  charsLength,
  model,
  source = UsageSourceEnum.fastgpt,
  extensionModel,
  extensionInputTokens,
  extensionOutputTokens
}: {
  billId?: string;
  teamId: string;
  tmbId: string;
  charsLength: number;
  model: string;
  source?: `${UsageSourceEnum}`;

  extensionModel?: string;
  extensionInputTokens?: number;
  extensionOutputTokens?: number;
}) => {
  const { total: totalVector, modelName: vectorModelName } = formatModelPrice2Store({
    model,
    inputLen: charsLength,
    type: ModelTypeEnum.vector
  });

  const { extensionTotal, extensionModelName } = (() => {
    if (!extensionModel || !extensionInputTokens || !extensionOutputTokens)
      return {
        extensionTotal: 0,
        extensionModelName: ''
      };
    const { total, modelName } = formatModelPrice2Store({
      model: extensionModel,
      inputLen: extensionInputTokens,
      outputLen: extensionOutputTokens,
      type: ModelTypeEnum.llm
    });
    return {
      extensionTotal: total,
      extensionModelName: modelName
    };
  })();

  const total = totalVector + extensionTotal;

  // 插入 Bill 记录
  if (billId) {
    concatUsage({
      teamId,
      tmbId,
      total: totalVector,
      billId,
      charsLength,
      listIndex: 0
    });
  } else {
    createUsage({
      teamId,
      tmbId,
      appName: 'wallet.moduleName.index',
      total,
      source,
      list: [
        {
          moduleName: 'wallet.moduleName.index',
          amount: totalVector,
          model: vectorModelName,
          charsLength
        },
        ...(extensionModel !== undefined
          ? [
              {
                moduleName: 'core.module.template.Query extension',
                amount: extensionTotal,
                model: extensionModelName,
                inputTokens: extensionInputTokens,
                outputTokens: extensionOutputTokens
              }
            ]
          : [])
      ]
    });
  }
  return { total };
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
  const { total, modelName } = formatModelPrice2Store({
    inputLen: inputTokens,
    outputLen: outputTokens,
    model: qgModel.model,
    type: ModelTypeEnum.llm
  });

  createUsage({
    teamId,
    tmbId,
    appName: 'wallet.bill.Next Step Guide',
    total,
    source: UsageSourceEnum.fastgpt,
    list: [
      {
        moduleName: 'wallet.bill.Next Step Guide',
        amount: total,
        model: modelName,
        inputTokens,
        outputTokens
      }
    ]
  });
};

export function pushAudioSpeechUsage({
  appName = 'wallet.bill.Audio Speech',
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
  const { total, modelName } = formatModelPrice2Store({
    model,
    inputLen: charsLength,
    type: ModelTypeEnum.audioSpeech
  });

  createUsage({
    teamId,
    tmbId,
    appName,
    total,
    source,
    list: [
      {
        moduleName: appName,
        amount: total,
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

  const { total, modelName } = formatModelPrice2Store({
    model: whisperModel.model,
    inputLen: duration,
    type: ModelTypeEnum.whisper,
    multiple: 60
  });

  const name = 'wallet.bill.Whisper';

  createUsage({
    teamId,
    tmbId,
    appName: name,
    total,
    source: UsageSourceEnum.fastgpt,
    list: [
      {
        moduleName: name,
        amount: total,
        model: modelName,
        duration
      }
    ]
  });
}

export function pushReRankUsage({
  teamId,
  tmbId,
  source,
  inputs
}: {
  teamId: string;
  tmbId: string;
  source: `${UsageSourceEnum}`;
  inputs: PostReRankProps['inputs'];
}) {
  const reRankModel = global.reRankModels[0];
  if (!reRankModel) return { total: 0 };

  const charsLength = inputs.reduce((sum, item) => sum + item.text.length, 0);

  const { total, modelName } = formatModelPrice2Store({
    model: reRankModel.model,
    inputLen: charsLength,
    type: ModelTypeEnum.rerank
  });
  const name = 'wallet.bill.ReRank';

  createUsage({
    teamId,
    tmbId,
    appName: name,
    total,
    source,
    list: [
      {
        moduleName: name,
        amount: total,
        model: modelName,
        charsLength
      }
    ]
  });

  return { total };
}
