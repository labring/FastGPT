import { IfElseResultEnum } from '../../core/workflow/template/system/ifElse/constant';
import { getNanoid } from '../string/tools';
import type { IfElseListItemType } from '../../core/workflow/template/system/ifElse/type';

export const getElseIFLabel = (i: number) => {
  return i === 0 ? IfElseResultEnum.IF : `${IfElseResultEnum.ELSE_IF} ${i}`;
};

export const createIfElseBranchId = () => getNanoid();

/** 返回稳定分支 handle；旧数据没有 branchId 时回退到历史展示标签。 */
export const getIfElseBranchHandleKey = (item: IfElseListItemType, index?: number) =>
  item.branchId ?? (index === undefined ? '' : getElseIFLabel(index));

/** 新建条件分支补齐唯一 ID，已有唯一 ID 保持不变；重复 ID 重新生成。 */
export const initNewIfElseList = (list: IfElseListItemType[] = []) => {
  const usedBranchIds = new Set<string>();

  return list.map((item) => {
    const preferredBranchId = item.branchId || createIfElseBranchId();
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
