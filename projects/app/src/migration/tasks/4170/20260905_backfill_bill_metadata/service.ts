import { BillPayWayEnum, BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { connectionMongo } from '@fastgpt/service/common/mongo';

const billCollectionName = 'pays';

const legacyBalanceBillQuery = {
  type: BillTypeEnum.balance,
  $or: [
    { metadata: { $exists: false } },
    { metadata: null },
    {
      metadata: { $type: 'object' },
      'metadata.payWay': { $exists: false }
    }
  ]
};

const getBillCollection = () => {
  const database = connectionMongo.connection.db;
  if (!database) throw new Error('MongoDB is not connected');
  return database.collection(billCollectionName);
};

/** 统计旧版微信充值链路产生且缺少支付方式的历史账单。 */
export const countLegacyBalanceBillsWithoutPayWay = () =>
  getBillCollection().countDocuments(legacyBalanceBillQuery);

/**
 * 将旧版微信充值订单缺失的支付方式确定性回填为 wx。
 * 仅匹配 balance 订单，保留已有 metadata 字段，且绝不覆盖已有 payWay。
 */
export const backfillLegacyBalanceBillMetadata = async () => {
  const result = await getBillCollection().updateMany(legacyBalanceBillQuery, [
    {
      $set: {
        metadata: {
          $cond: [
            { $eq: [{ $type: '$metadata' }, 'object'] },
            { $mergeObjects: ['$metadata', { payWay: BillPayWayEnum.wx }] },
            { payWay: BillPayWayEnum.wx }
          ]
        }
      }
    }
  ]);

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount
  };
};
