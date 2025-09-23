import type { DatasetCiteItemType } from '@fastgpt/global/core/dataset/type';

// 获取对话时间时，引用的内容
export function processChatTimeFilter(
  dataList: DatasetCiteItemType[],
  chatTime: Date
): DatasetCiteItemType[] {
  return dataList.map((item) => {
    const defaultItem = item;

    if (!item.history) return defaultItem;

    const history = item.history;
    const formatedChatTime = new Date(chatTime);

    if (item.updateTime <= formatedChatTime) {
      return defaultItem;
    }

    const latestHistoryIndex = history.findIndex(
      (historyItem) => historyItem.updateTime <= formatedChatTime
    );

    if (latestHistoryIndex === -1) {
      return defaultItem;
    }

    const latestHistory = history[latestHistoryIndex];

    return {
      ...item,
      q: latestHistory.q,
      a: latestHistory.a,
      updateTime: latestHistory.updateTime,
      updated: true
    };
  });
}
