import { getNanoid } from '../../../../../common/string/tools';
import { getElseIFLabel } from '../../../utils';
import type { IfElseListItemType } from './type';

export const createIfElseBranchId = () => getNanoid();

/** 返回稳定分支 handle；旧数据没有 branchId 时回退到历史展示标签。 */
export const getIfElseBranchHandleKey = (item: IfElseListItemType, index?: number) =>
  item.branchId ?? (index === undefined ? '' : getElseIFLabel(index));

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
