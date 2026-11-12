import { getValidModelOrderRank, sortModelOrderItems } from '@fastgpt/global/core/ai/model/order';
import type { ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoAIModel } from './schema';

/**
 * 为新建模型在当前归属作用域顶部预留连续的 1-based rank（1..count），使新增模型默认排在首位。
 * 已有合法非负 rank 默认整体后移以保留相对顺序；若后移结果即将超出 MAX_SAFE_INTEGER，
 * 则按当前有效展示顺序重排为安全连续 rank，避免写出 schema 无法解析的不安全整数。
 * 未设置 rank 的历史记录维持缺省并继续排在末尾。
 */
export const reserveLeadingModelRanks = async ({
  filter,
  count,
  session
}: {
  filter: Record<string, unknown>;
  count: number;
  session?: ClientSession;
}) => {
  if (count <= 0) return;
  if (!Number.isSafeInteger(count)) {
    throw new RangeError('Model rank reservation count must be a safe integer');
  }

  const run = async (activeSession: ClientSession) => {
    const rankedFilter = {
      ...filter,
      sortOrder: { $type: 'number', $gte: 0, $lte: Number.MAX_SAFE_INTEGER }
    };

    // 1. 查询当前归属作用域内的最小与最大合法 rank，不存在已排序记录时无需后移。
    const minRankedModel = await MongoAIModel.findOne(rankedFilter)
      .select({ sortOrder: 1 })
      .sort({ sortOrder: 1 })
      .session(activeSession)
      .lean();

    if (minRankedModel === null || typeof minRankedModel.sortOrder !== 'number') {
      return;
    }

    const maxRankedModel = await MongoAIModel.findOne(rankedFilter)
      .select({ sortOrder: 1 })
      .sort({ sortOrder: -1 })
      .session(activeSession)
      .lean();

    if (maxRankedModel === null || typeof maxRankedModel.sortOrder !== 'number') {
      return;
    }

    // 2. 兼容 0-based 历史/测试数据，保证后移后的最小 rank 严格大于 count。
    const shift = minRankedModel.sortOrder < 1 ? count + 1 : count;
    if (
      Number.isSafeInteger(shift) &&
      maxRankedModel.sortOrder <= Number.MAX_SAFE_INTEGER - shift
    ) {
      await MongoAIModel.updateMany(
        rankedFilter,
        { $inc: { sortOrder: shift } },
        { session: activeSession }
      );
      return;
    }

    // 3. 后移结果即将超出安全整数上限时，按当前有效顺序重排为 count+1 起的连续安全 rank。
    const rankedDocuments = await MongoAIModel.find(rankedFilter)
      .select({ _id: 1, sortOrder: 1 })
      .sort({ _id: -1 })
      .session(activeSession)
      .lean();
    const validRankedDocuments = sortModelOrderItems(
      rankedDocuments.filter(({ sortOrder }) => getValidModelOrderRank(sortOrder) !== undefined)
    );

    if (!Number.isSafeInteger(count + validRankedDocuments.length)) {
      throw new RangeError('Model sortOrder exceeds MAX_SAFE_INTEGER');
    }

    const updates = validRankedDocuments.flatMap(({ _id, sortOrder }, index) => {
      const nextSortOrder = count + index + 1;
      if (sortOrder === nextSortOrder) return [];
      return [
        {
          updateOne: {
            filter: { _id, ...filter },
            update: { $set: { sortOrder: nextSortOrder } }
          }
        }
      ];
    });
    if (updates.length > 0) {
      await MongoAIModel.bulkWrite(updates, { session: activeSession });
    }
  };

  if (session) {
    return run(session);
  }
  return mongoSessionRun(run, {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' }
  });
};
