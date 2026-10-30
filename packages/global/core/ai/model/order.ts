import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';

/** 模型顺序操作；beforeModelId 为空表示移动到当前作用域末尾。 */
export const ModelOrderMoveSchema = z.object({
  modelId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '需要移动的模型 ID'
  }),
  beforeModelId: ObjectIdSchema.nullable().meta({
    example: '68ad85a7463006c963799a06',
    description: '移动到该模型之前；传 null 表示移动到当前作用域末尾'
  })
});
export type ModelOrderMove = z.infer<typeof ModelOrderMoveSchema>;

/**
 * 按持久化 rank 排列管理列表；缺失或不安全的历史值排在末尾，并保留传入顺序作为稳定兜底。
 */
export const sortModelOrderItems = <T extends { sortOrder?: number }>(items: T[]) =>
  items
    .map((item, index) => ({ item, index, rank: getValidModelOrderRank(item.sortOrder) }))
    .sort((a, b) => {
      if (a.rank === undefined && b.rank === undefined) return a.index - b.index;
      if (a.rank === undefined) return 1;
      if (b.rank === undefined) return -1;
      return a.rank - b.rank || a.index - b.index;
    })
    .map(({ item }) => item);

/** 将草稿顺序转换为最少的“移动到某项之前”操作，稳定子序列由 LIS 在线性空间中保留。 */
export const buildModelOrderMoves = (
  currentIds: string[],
  targetIds: string[]
): ModelOrderMove[] => {
  const currentIndex = new Map(currentIds.map((modelId, index) => [modelId, index]));
  if (
    currentIds.length !== targetIds.length ||
    currentIndex.size !== currentIds.length ||
    new Set(targetIds).size !== targetIds.length ||
    targetIds.some((modelId) => !currentIndex.has(modelId))
  ) {
    throw new Error('Current and target model orders must contain the same unique IDs');
  }

  const tails: number[] = [];
  const tailIndexes: number[] = [];
  const previousIndexes = new Array<number>(targetIds.length).fill(-1);

  targetIds.forEach((modelId, targetIndex) => {
    const currentPosition = currentIndex.get(modelId)!;
    let low = 0;
    let high = tails.length;

    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (tails[middle] < currentPosition) low = middle + 1;
      else high = middle;
    }

    if (low > 0) previousIndexes[targetIndex] = tailIndexes[low - 1];
    tails[low] = currentPosition;
    tailIndexes[low] = targetIndex;
  });

  const stableIndexes = new Set<number>();
  let stableIndex = tailIndexes[tails.length - 1];
  while (stableIndex !== undefined && stableIndex >= 0) {
    stableIndexes.add(stableIndex);
    stableIndex = previousIndexes[stableIndex];
  }

  const moves: ModelOrderMove[] = [];
  let beforeModelId: string | null = null;
  for (let index = targetIds.length - 1; index >= 0; index--) {
    const modelId = targetIds[index];
    if (!stableIndexes.has(index)) moves.push({ modelId, beforeModelId });
    beforeModelId = modelId;
  }

  return moves;
};

/** 只接受 Mongo Number 可以精确表示的非负整数 rank。 */
export const getValidModelOrderRank = (rank: number | undefined) =>
  typeof rank === 'number' && Number.isSafeInteger(rank) && rank >= 0 ? rank : undefined;
