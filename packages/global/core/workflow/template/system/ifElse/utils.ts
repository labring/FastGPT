import { getNanoid } from '../../../../../common/string/tools';
import { getElseIFLabel } from '../../../utils';
import type { IfElseListItemType } from './type';

export const createIfElseBranchId = () => getNanoid();

/**
 * 返回判断器分支的稳定 handle key。旧数据没有 branchId 时回退到旧展示标签，
 * 保证未迁移工作流的 IF / ELSE IF n 连线仍能匹配。
 */
export const getIfElseBranchHandleKey = (item: IfElseListItemType, index: number) =>
  item.branchId || getElseIFLabel(index);

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
 * 旧工作流加载兼容：缺失 branchId 的分支补旧 handle label，避免保存后断开旧 edge。
 */
export const normalizeIfElseList = (list: IfElseListItemType[] = []) =>
  ensureUniqueBranchIds({
    list,
    createFallback: (_item, index) => getElseIFLabel(index)
  });

/**
 * 新建判断器节点初始化：默认分支必须生成随机 ID，不能继续复用 index label。
 */
export const initNewIfElseList = (list: IfElseListItemType[] = []) =>
  ensureUniqueBranchIds({
    list,
    createFallback: () => createIfElseBranchId()
  });
