import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { QuoteDataItemType } from './constants';

// 获取对话时间时，引用的内容
export function processChatTimeFilter(
  dataList: DatasetDataSchemaType[],
  chatTime: Date
): QuoteDataItemType[] {
  return dataList.map((item) => {
    const defaultItem = {
      _id: item._id,
      q: item.q,
      a: item.a,
      updateTime: item.updateTime,
      index: item.chunkIndex
    };

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
      _id: item._id,
      q: latestHistory.q,
      a: latestHistory.a,
      updateTime: latestHistory.updateTime,
      index: item.chunkIndex,
      updated: true
    };
  });
}
