import { BillSourceEnum } from '@fastgpt/global/common/bill/constants';
import { getModelMap, ModelTypeEnum } from '@/service/core/ai/model';
import { ChatHistoryItemResType } from '@/types/chat';
import { formatPrice } from '@fastgpt/global/common/bill/tools';
import { addLog } from '@fastgpt/service/common/mongo/controller';
import type { ConcatBillProps, CreateBillType } from '@fastgpt/global/common/bill/type.d';
import { defaultQGModels } from '@/constants/model';
import { POST } from '@fastgpt/service/common/api/plusRequest';

function createBill(data: CreateBillType) {
  if (!global.systemEnv.pluginBaseUrl) return;
  POST('/common/bill/createBill', data);
}
async function concatBill(data: ConcatBillProps) {
  if (!global.systemEnv.pluginBaseUrl) return;
  POST('/common/bill/concatBill', data);
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
  totalTokens,
  billId
}: {
  teamId: string;
  tmbId: string;
  totalTokens: number;
  billId: string;
}) => {
  addLog.info('splitData generate success', { totalTokens });

  // 获取模型单价格
  const unitPrice = global.qaModels?.[0]?.price || 3;
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
  model
}: {
  billId?: string;
  teamId: string;
  tmbId: string;
  tokenLen: number;
  model: string;
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
      source: BillSourceEnum.fastgpt,
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

export const countModelPrice = ({
  model,
  tokens,
  type
}: {
  model: string;
  tokens: number;
  type: `${ModelTypeEnum}`;
}) => {
  const modelData = getModelMap?.[type]?.(model);
  if (!modelData) return 0;
  return modelData.price * tokens;
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
