import { ChatTypeEnum } from '../constants';
import type { ChatSiteItemType } from '../type';

/**
 * 为 log 模式的连续删除消息补充折叠元信息。
 *
 * 输入输出约定：
 * - 非 log 模式不需要删除记录折叠，直接返回原 records 引用，避免无意义重算。
 * - log 模式会把相邻的 `deleteTime` 消息视为一个删除组，并在组首补
 *   `collapseTop`、组尾补 `collapseBottom`，供列表渲染折叠开关。
 * - 删除组内的消息会被浅拷贝，避免把折叠展示字段写回原始 `chatRecords`。
 * - 非删除消息仍保持原对象引用，减少渲染层不必要的对象变化。
 *
 * 边界行为：
 * - 单条删除消息会同时拥有 `collapseTop` 和 `collapseBottom`。
 * - 只有删除组内所有 dataId 都在 `expandedDeletedGroups` 中时，该组才算展开。
 * - 连续删除组可以出现在列表开头、结尾或中间，统一通过前后 deleteTime 判断边界。
 */
export const getProcessedChatRecords = ({
  chatType,
  chatRecords,
  expandedDeletedGroups
}: {
  chatType: ChatTypeEnum;
  chatRecords: ChatSiteItemType[];
  expandedDeletedGroups: Set<string>;
}): ChatSiteItemType[] => {
  if (chatType !== ChatTypeEnum.log) {
    return chatRecords;
  }

  const result: ChatSiteItemType[] = [];
  let currentGroup: {
    items: ChatSiteItemType[];
    dataIds: string[];
  } | null = null;

  chatRecords.forEach((item, index) => {
    const isDeleted = !!item.deleteTime;
    const prevIsDeleted = index > 0 ? !!chatRecords[index - 1].deleteTime : false;
    const nextIsDeleted =
      index < chatRecords.length - 1 ? !!chatRecords[index + 1].deleteTime : false;

    // 当前 deleted item 的前一条不是 deleted，说明进入了一个新的连续删除组。
    if (isDeleted && !prevIsDeleted) {
      currentGroup = {
        items: [],
        dataIds: []
      };
    }

    // 删除组内保留原始 item，等组结束时统一浅拷贝并补充首尾折叠信息。
    if (currentGroup && isDeleted) {
      currentGroup.items.push(item);
      currentGroup.dataIds.push(item.dataId);
    }

    // 当前 deleted item 后面不再是 deleted，或已经到列表末尾，说明删除组结束。
    if (currentGroup && (!nextIsDeleted || index === chatRecords.length - 1)) {
      const isExpanded = currentGroup.dataIds.every((id) => expandedDeletedGroups.has(id));
      const count = currentGroup.dataIds.length;

      currentGroup.items.forEach((groupItem, groupIndex) => {
        const extendedItem: ChatSiteItemType = { ...groupItem };

        // 组首渲染顶部折叠入口；单条删除消息也会命中该分支。
        if (groupIndex === 0) {
          extendedItem.collapseTop = {
            count,
            dataIds: currentGroup!.dataIds,
            isExpanded
          };
        }

        // 组尾渲染底部折叠入口；单条删除消息会同时拥有 top 和 bottom。
        if (groupIndex === currentGroup!.items.length - 1) {
          extendedItem.collapseBottom = {
            count,
            dataIds: currentGroup!.dataIds,
            isExpanded
          };
        }

        result.push(extendedItem);
      });

      currentGroup = null;
    } else if (!isDeleted) {
      // 非删除消息不参与折叠分组，保持原对象引用。
      result.push(item);
    }
  });

  return result;
};
