import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { ModelTypeEnum } from '@/service/core/ai/model';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import { addLog } from '@fastgpt/service/common/system/log';
import { PostReRankProps } from '@fastgpt/global/core/ai/api';
import { createBill, concatBill } from './controller';
import { formatModelPrice2Store } from '@/service/support/wallet/bill/utils';

export const pushChatBill = ({
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
  source: `${BillSourceEnum}`;
  response: ChatHistoryItemResType[];
}) => {
  const total = response.reduce((sum, item) => sum + (item.price || 0), 0);

  createBill({
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
      outputTokens: item.outputTokens
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

export const pushQABill = async ({
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
  const { total } = formatModelPrice2Store({
    model,
    inputLen: inputTokens,
    outputLen: outputTokens,
    type: ModelTypeEnum.qa
  });

  concatBill({
    billId,
    teamId,
    tmbId,
    total,
    inputTokens,
    outputTokens,
    listIndex: 1
  });

  return { total };
};

export const pushGenerateVectorBill = ({
  billId,
  teamId,
  tmbId,
  tokens,
  model,
  source = BillSourceEnum.fastgpt
}: {
  billId?: string;
  teamId: string;
  tmbId: string;
  tokens: number;
  model: string;
  source?: `${BillSourceEnum}`;
}) => {
  let { total, modelName } = formatModelPrice2Store({
    model,
    inputLen: tokens,
    type: ModelTypeEnum.vector
  });

  total = total < 1 ? 1 : total;

  // 插入 Bill 记录
  if (billId) {
    concatBill({
      teamId,
      tmbId,
      total,
      billId,
      inputTokens: tokens,
      listIndex: 0
    });
  } else {
    createBill({
      teamId,
      tmbId,
      appName: 'wallet.moduleName.index',
      total,
      source,
      list: [
        {
          moduleName: 'wallet.moduleName.index',
          amount: total,
          model: modelName,
          inputTokens: tokens
        }
      ]
    });
  }
  return { total };
};

export const pushQuestionGuideBill = ({
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
  const qgModel = global.qgModels[0];
  const { total, modelName } = formatModelPrice2Store({
    inputLen: inputTokens,
    outputLen: outputTokens,
    model: qgModel.model,
    type: ModelTypeEnum.qg
  });

  createBill({
    teamId,
    tmbId,
    appName: 'wallet.bill.Next Step Guide',
    total,
    source: BillSourceEnum.fastgpt,
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

export function pushAudioSpeechBill({
  appName = 'wallet.bill.Audio Speech',
  model,
  textLen,
  teamId,
  tmbId,
  source = BillSourceEnum.fastgpt
}: {
  appName?: string;
  model: string;
  textLen: number;
  teamId: string;
  tmbId: string;
  source: `${BillSourceEnum}`;
}) {
  const { total, modelName } = formatModelPrice2Store({
    model,
    inputLen: textLen,
    type: ModelTypeEnum.audioSpeech
  });

  createBill({
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
        textLen
      }
    ]
  });
}

export function pushWhisperBill({
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

  createBill({
    teamId,
    tmbId,
    appName: name,
    total,
    source: BillSourceEnum.fastgpt,
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

export function pushReRankBill({
  teamId,
  tmbId,
  source,
  inputs
}: {
  teamId: string;
  tmbId: string;
  source: `${BillSourceEnum}`;
  inputs: PostReRankProps['inputs'];
}) {
  const reRankModel = global.reRankModels[0];
  if (!reRankModel) return { total: 0 };

  const textLen = inputs.reduce((sum, item) => sum + item.text.length, 0);

  const { total, modelName } = formatModelPrice2Store({
    model: reRankModel.model,
    inputLen: textLen,
    type: ModelTypeEnum.rerank
  });
  const name = 'wallet.bill.ReRank';

  createBill({
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
        textLen
      }
    ]
  });

  return { total };
}
