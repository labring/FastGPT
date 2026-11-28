import { runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';
import { bridgeDbSessionToClientSession } from '../../../../common/mongo/sessionRun';
import { buildTrainingUsageBillIncrement, getTrainingUsageItems } from '../controller';
import { MongoUsage } from '../schema';
import { MongoUsageItem } from '../usageItemSchema';

/** 文档账单绑定或追加工作时，在同一事务内按阶段和模型补齐预建明细。 */
export const ensureTrainingUsageItems = async (
  input: Parameters<typeof getTrainingUsageItems>[0],
  tx?: DbSession
): Promise<void> => {
  if (!tx) {
    return runInTransaction((tx) => ensureTrainingUsageItems(input, tx), { dialect: 'mongo' });
  }
  const session = bridgeDbSessionToClientSession(tx);
  const { teamId, usageId } = input;
  const existing = await MongoUsageItem.find({ teamId, usageId }, { itemType: 1, modelId: 1 })
    .session(session ?? null)
    .lean();
  const missing = getTrainingUsageItems(input).filter(
    ({ itemType, modelId }) =>
      !existing.some((item) => item.itemType === itemType && item.modelId === modelId)
  );
  if (missing.length > 0) {
    // 读到缺项后先写父账单；若结算已创建该明细，写冲突会让事务重读。
    const { matchedCount } = await MongoUsage.updateOne(
      { _id: usageId, teamId },
      buildTrainingUsageBillIncrement(0),
      { session, timestamps: false }
    );
    if (!matchedCount) throw new Error('Document training usage no longer exists');
    await MongoUsageItem.insertMany(missing, { session, ordered: true });
  }
};
