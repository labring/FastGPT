import type { ClientSession } from '../../../common/mongo';
import { MongoAIModel } from './schema';

/**
 * 为新建模型在当前归属作用域顶部预留连续的 1-based rank（1..count），使新增模型默认排在首位。
 * 仅后移已有合法非负 rank 以保留其原有相对顺序；未设置 rank 的历史记录维持缺省并继续排在末尾。
 */
export const reserveLeadingModelRanks = async ({
  filter,
  count,
  session
}: {
  filter: Record<string, unknown>;
  count: number;
  session: ClientSession;
}) => {
  if (count <= 0) return;

  const rankedFilter = {
    ...filter,
    sortOrder: { $type: 'number', $gte: 0, $lte: Number.MAX_SAFE_INTEGER }
  };
  const minRankedModel = await MongoAIModel.findOne(rankedFilter)
    .select({ sortOrder: 1 })
    .sort({ sortOrder: 1 })
    .session(session)
    .lean();

  if (minRankedModel === null || typeof minRankedModel.sortOrder !== 'number') {
    return;
  }

  // 兼容 0-based 历史/测试数据，保证后移后的最小 rank 严格大于 count。
  const shift = minRankedModel.sortOrder < 1 ? count + 1 : count;
  await MongoAIModel.updateMany(rankedFilter, { $inc: { sortOrder: shift } }, { session });
};
