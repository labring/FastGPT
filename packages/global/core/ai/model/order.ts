import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';

/**
 * 新建模型默认写入的置顶 rank。
 * 排序分段约定：
 * - `0`：新建但尚未经过手动全量排序的模型，始终排在已手动排序（`1..N`）与历史未排序（`undefined`）之前；
 *   多个 `0` 之间复用目录快照查询的 `_id: -1` 顺序，后创建的排在更前。
 * - `1..N`：`updateModelOrder` 保存完整顺序时写入的连续正整数（历史从未写过 `0`），保存时会将存量 `0` 与 `undefined` 一并归一化为 `1..N`。
 * - `undefined`：历史存量未排序记录，排在所有显式非负 rank 末尾。
 */
export const NEW_MODEL_SORT_ORDER = 0;

/** 模型展示顺序；数组中的第一个模型会被写入 rank 1。 */
export const ModelOrderIdsSchema = z
  .array(ObjectIdSchema)
  .min(1)
  .superRefine((modelIds, ctx) => {
    if (new Set(modelIds).size !== modelIds.length) {
      ctx.addIssue({ code: 'custom', message: 'modelIds must be unique' });
    }
  })
  .meta({
    example: ['68ad85a7463006c963799a05', '68ad85a7463006c963799a06'],
    description: '按展示顺序排列的完整模型 ID 列表，第一个模型的 rank 为 1'
  });
export type ModelOrderIds = z.infer<typeof ModelOrderIdsSchema>;

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

/** 只接受 Mongo Number 可以精确表示的非负整数 rank。 */
export const getValidModelOrderRank = (rank: number | undefined) =>
  typeof rank === 'number' && Number.isSafeInteger(rank) && rank >= 0 ? rank : undefined;
