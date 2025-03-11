import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { PaginationProps } from '@fastgpt/web/common/fetch/type';

export type GetQuoteDataProps = {
  datasetDataIdList: string[];
  chatTime: Date;

  collectionIdList: string[];
  chatItemId: string;
  appId: string;
  chatId: string;
  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
};

export type GetQuoteDataRes = {
  quoteList: DatasetDataSchemaType[];
};

export const dataFieldSelector =
  '_id datasetId collectionId q a chunkIndex history updateTime currentChatItemId prevId nextId';

async function handler(req: ApiRequestProps<GetQuoteDataProps>): Promise<GetQuoteDataRes> {
  const {
    datasetDataIdList,
    chatTime,

    collectionIdList,
    chatItemId,
    chatId,
    appId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  } = req.body;

  const authRes = await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });

  // TODO: 如果 collection 被删了
  const res = await Promise.all(
    collectionIdList.map(async (collectionId) => {
      const [collection, authCollection] = await Promise.all([
        getCollectionWithDataset(collectionId),
        authCollectionInChat({ appId, chatId, chatItemId, collectionId })
      ]);

      return { collection, authCollection };
    })
  );

  const list = await MongoDatasetData.find(
    { _id: { $in: datasetDataIdList } },
    dataFieldSelector
  ).lean();

  const quoteList = processChatTimeFilter(list, chatTime, chatItemId);

  return {
    quoteList
  };
}

export default NextAPI(handler);

export function processChatTimeFilter(
  list: DatasetDataSchemaType[],
  chatTime?: Date,
  chatItemId?: string
) {
  if (!chatTime) return list;

  return list.map((item) => {
    if (!item.history) return item;

    const { history, ...rest } = item;
    const formatedChatTime = new Date(chatTime);

    if (item.updateTime <= formatedChatTime) {
      return rest;
    }

    const latestHistoryIndex = history.findIndex(
      (historyItem: any) => historyItem.updateTime <= formatedChatTime
    );

    if (latestHistoryIndex === -1) return rest;

    const updatedData =
      item.currentChatItemId === chatItemId
        ? rest
        : history
            .slice(0, latestHistoryIndex + 1)
            .find((historyItem: any) => historyItem.currentChatItemId === chatItemId);

    const latestHistory = history[latestHistoryIndex];

    return {
      ...rest,
      q: latestHistory?.q || item.q,
      a: latestHistory?.a || item.a,
      updatedData
    };
  });
}
