import { Bill } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { BillSourceEnum } from '@/constants/user';
import { getModelMap, ModelTypeEnum } from '@/service/core/ai/model';
import { ChatHistoryItemResType } from '@/types/chat';
import { formatPrice } from '@fastgpt/global/common/bill/tools';
import { addLog } from '@/service/utils/tools';
import type { CreateBillType } from '@/types/common/bill';
import { defaultQGModels } from '@/constants/model';

async function createBill(data: CreateBillType) {
  try {
    await Promise.all([
      MongoUser.findByIdAndUpdate(data.userId, {
        $inc: { balance: -data.total }
      }),
      Bill.create(data)
    ]);
  } catch (error) {
    addLog.error(`createBill error`, error);
  }
}
async function concatBill({
  billId,
  total,
  listIndex,
  tokens = 0,
  userId
}: {
  billId?: string;
  total: number;
  listIndex?: number;
  tokens?: number;
  userId: string;
}) {
  if (!billId) return;
  try {
    await Promise.all([
      Bill.findOneAndUpdate(
        {
          _id: billId,
          userId
        },
        {
          $inc: {
            total,
            ...(listIndex !== undefined && {
              [`list.${listIndex}.amount`]: total,
              [`list.${listIndex}.tokenLen`]: tokens
            })
          }
        }
      ),
      MongoUser.findByIdAndUpdate(userId, {
        $inc: { balance: -total }
      })
    ]);
  } catch (error) {}
}

export const pushChatBill = ({
  appName,
  appId,
  userId,
  source,
  response
}: {
  appName: string;
  appId: string;
  userId: string;
  source: `${BillSourceEnum}`;
  response: ChatHistoryItemResType[];
}) => {
  const total = response.reduce((sum, item) => sum + item.price, 0);

  createBill({
    userId,
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
    userId,
    price: formatPrice(total)
  });
  return { total };
};

export const pushQABill = async ({
  userId,
  totalTokens,
  billId
}: {
  userId: string;
  totalTokens: number;
  billId: string;
}) => {
  addLog.info('splitData generate success', { totalTokens });

  // 获取模型单价格, 都是用 gpt35 拆分
  const unitPrice = global.qaModels?.[0]?.price || 3;
  // 计算价格
  const total = unitPrice * totalTokens;

  concatBill({
    billId,
    userId,
    total,
    tokens: totalTokens,
    listIndex: 1
  });

  return { total };
};

export const pushGenerateVectorBill = async ({
  billId,
  userId,
  tokenLen,
  model
}: {
  billId?: string;
  userId: string;
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
      userId,
      total,
      billId,
      tokens: tokenLen,
      listIndex: 0
    });
  } else {
    createBill({
      userId,
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

export const pushQuestionGuideBill = ({ tokens, userId }: { tokens: number; userId: string }) => {
  const qgModel = global.qgModels?.[0] || defaultQGModels[0];
  const total = qgModel.price * tokens;
  createBill({
    userId,
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
