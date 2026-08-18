import { getNanoid } from '../../../../../common/string/tools';
import type { IfElseListItemType } from './type';

export const createIfElseBranchId = () => getNanoid();

/** 返回已迁移判断器分支的稳定 handle key。 */
export const getIfElseBranchHandleKey = (item: IfElseListItemType) => item.branchId ?? '';

const ensureUniqueBranchIds = ({
  list,
  createFallback
}: {
  list: IfElseListItemType[];
  createFallback: (item: IfElseListItemType, index: number) => string;
}) => {
  const usedBranchIds = new Set<string>();

  return list.map((item, index) => {
    const preferredBranchId = item.branchId || createFallback(item, index);
    const branchId = (() => {
      if (!usedBranchIds.has(preferredBranchId)) return preferredBranchId;

      let nextBranchId = createIfElseBranchId();
      while (usedBranchIds.has(nextBranchId)) {
        nextBranchId = createIfElseBranchId();
      }
      return nextBranchId;
    })();

    usedBranchIds.add(branchId);
    return {
      ...item,
      branchId
    };
  });
};

/**
 * 新建判断器节点初始化：默认分支必须生成随机 ID，不能继续复用 index label。
 */
export const initNewIfElseList = (list: IfElseListItemType[] = []) =>
  ensureUniqueBranchIds({
    list,
    createFallback: () => createIfElseBranchId()
  });
