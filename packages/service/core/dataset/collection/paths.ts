import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { MongoDatasetCollection } from './schema';

/**
 * 递归查询集合的祖先目录链（从根到直接父级，不包含集合自身）。
 *
 * 递归而非聚合：调用方都已经校验过父目录深度，层级有限；且每一层都命中 `_id` 主键查询。
 * 集合不存在或父级断链时提前返回已收集的部分，不会抛错。
 *
 * 带环检测而非信任数据：历史脏数据可能出现父子互指，此时每层都是 `await` 主键查询，
 * 不会爆栈而是无限查询下去，必须用 visited 兜底。命中环时保留已收集的链路并停止向上，
 * 与「父级断链」语义保持一致——审计位置只用于展示，不能因此让主流程报错。
 */
export async function getDatasetCollectionPaths({
  parentId = ''
}: {
  parentId?: string;
}): Promise<ParentTreePathItemType[]> {
  const visited = new Set<string>();

  async function find(parentId: ParentIdType): Promise<ParentTreePathItemType[]> {
    if (!parentId) {
      return [];
    }
    // 已访问过说明链路成环，直接截断，避免无限查询
    if (visited.has(String(parentId))) {
      return [];
    }
    visited.add(String(parentId));

    const parent = await MongoDatasetCollection.findOne({ _id: parentId }, 'name parentId');

    if (!parent) return [];

    const paths = await find(parent.parentId ?? undefined);
    paths.push({ parentId, parentName: parent.name });

    return paths;
  }

  return find(parentId);
}
