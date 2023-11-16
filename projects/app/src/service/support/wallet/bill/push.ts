import { BillSourceEnum, PRICE_SCALE } from '@fastgpt/global/support/wallet/bill/constants';
import { getAudioSpeechModel, getQAModel } from '@/service/core/ai/model';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/api.d';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { addLog } from '@fastgpt/service/common/mongo/controller';
import type { ConcatBillProps, CreateBillProps } from '@fastgpt/global/support/wallet/bill/api.d';
import { defaultQGModels } from '@fastgpt/global/core/ai/model';
import { POST } from '@fastgpt/service/common/api/plusRequest';

export function createBill(data: CreateBillProps) {
  if (!global.systemEnv.pluginBaseUrl) return;
  if (data.total === 0) {
    addLog.info('0 Bill', data);
  }
  POST('/support/wallet/bill/createBill', data);
}
export function concatBill(data: ConcatBillProps) {
  if (!global.systemEnv.pluginBaseUrl) return;
  if (data.total === 0) {
    addLog.info('0 Bill', data);
  }
  POST('/support/wallet/bill/concatBill', data);
}

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
  const total = response.reduce((sum, item) => sum + item.price, 0);

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
      tokenLen: item.tokens
    }))
  });
  addLog.info(`finish completions`, {
    source,
    teamId,
    tmbId,
    price: formatPrice(total)
  });
  return { total };
};

export const pushQABill = async ({
  teamId,
  tmbId,
  model,
  totalTokens,
  billId
}: {
  teamId: string;
  tmbId: string;
  model: string;
  totalTokens: number;
  billId: string;
}) => {
  // 获取模型单价格
  const unitPrice = getQAModel(model).price;
  // 计算价格
  const total = unitPrice * totalTokens;

  concatBill({
    billId,
    teamId,
    tmbId,
    total,
    tokens: totalTokens,
    listIndex: 1
  });

  return { total };
};

export const pushGenerateVectorBill = async ({
  billId,
  teamId,
  tmbId,
  tokenLen,
  model,
  source = BillSourceEnum.fastgpt
}: {
  billId?: string;
  teamId: string;
  tmbId: string;
  tokenLen: number;
  model: string;
  source?: `${BillSourceEnum}`;
}) => {
  // 计算价格. 至少为1
  const vectorModel =
    global.vectorModels.find((item) => item.model === model) || global.vectorModels[0];
  const unitPrice = vectorModel.price || 0.2;
  let total = unitPrice * tokenLen;
  total = total > 1 ? total : 1;

  // 插入 Bill 记录
  if (billId) {
    concatBill({
      teamId,
      tmbId,
      total,
      billId,
      tokens: tokenLen,
      listIndex: 0
    });
  } else {
    createBill({
      teamId,
      tmbId,
      appName: '索引生成',
      total,
      source,
      list: [
        {
          moduleName: '索引生成',
          amount: total,
          model: vectorModel.name,
          tokenLen
        }
      ]
    });
  }
  return { total };
};

export const pushQuestionGuideBill = ({
  tokens,
  teamId,
  tmbId
}: {
  tokens: number;
  teamId: string;
  tmbId: string;
}) => {
  const qgModel = global.qgModels?.[0] || defaultQGModels[0];
  const total = qgModel.price * tokens;
  createBill({
    teamId,
    tmbId,
    appName: '下一步指引',
    total,
    source: BillSourceEnum.fastgpt,
    list: [
      {
        moduleName: '下一步指引',
        amount: total,
        model: qgModel.name,
        tokenLen: tokens
      }
    ]
  });
};

export function pushAudioSpeechBill({
  appName = 'wallet.bill.Audio Speech',
  model,
  textLength,
  teamId,
  tmbId,
  source = BillSourceEnum.fastgpt
}: {
  appName?: string;
  model: string;
  textLength: number;
  teamId: string;
  tmbId: string;
  source: `${BillSourceEnum}`;
}) {
  const modelData = getAudioSpeechModel(model);
  const total = modelData.price * textLength;
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
        model: modelData.name,
        tokenLen: textLength
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
  const modelData = global.whisperModel;

  if (!modelData) return;

  const total = ((modelData.price * duration) / 60) * PRICE_SCALE;

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
        model: modelData.name,
        tokenLen: duration
      }
    ]
  });
}
