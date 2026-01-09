import { useState, useCallback, useMemo } from 'react';
import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type.d';

export const useDeletedGroups = (chatRecords: ChatSiteItemType[]) => {
  const [expandedDeletedGroups, setExpandedDeletedGroups] = useState<number[]>([]);

  const toggleDeletedGroup = useCallback((groupIndex: number) => {
    setExpandedDeletedGroups((prev) => {
      if (prev.includes(groupIndex)) {
        return prev.filter((i) => i !== groupIndex);
      } else {
        return [...prev, groupIndex];
      }
    });
  }, []);

  // 预处理聊天记录，计算删除分组信息
  const processedRecords = useMemo(() => {
    let deletedGroupIndex = -1;
    let isInDeletedGroup = false;
    let currentGroupCount = 0;

    return chatRecords.map((item, index) => {
      const isDeleted = !!item.deleteTime;
      const prevIsDeleted = index > 0 ? !!chatRecords[index - 1].deleteTime : false;
      const nextIsDeleted =
        index < chatRecords.length - 1 ? !!chatRecords[index + 1].deleteTime : false;

      const enteringDeletedGroup = isDeleted && !prevIsDeleted;
      const leavingDeletedGroup = !isDeleted && prevIsDeleted;
      const isLastInDeletedGroup = isDeleted && !nextIsDeleted;

      if (enteringDeletedGroup) {
        deletedGroupIndex++;
        isInDeletedGroup = true;
        // 计算当前删除组的数量
        currentGroupCount = 0;
        for (let i = index; i < chatRecords.length; i++) {
          if (chatRecords[i].deleteTime) currentGroupCount++;
          else break;
        }
      } else if (leavingDeletedGroup) {
        isInDeletedGroup = false;
        currentGroupCount = 0;
      }

      const currentDeletedGroupIndex = deletedGroupIndex;
      const isExpanded = expandedDeletedGroups.includes(currentDeletedGroupIndex);

      return {
        item,
        index,
        isInDeletedGroup,
        enteringDeletedGroup,
        isLastInDeletedGroup,
        deletedGroupIndex: currentDeletedGroupIndex,
        isExpanded,
        deletedCount: currentGroupCount,
        shouldRender: !isInDeletedGroup || isExpanded
      };
    });
  }, [chatRecords, expandedDeletedGroups]);

  return {
    processedRecords,
    toggleDeletedGroup
  };
};
