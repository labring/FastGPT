import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { LinkedListResponse, LinkedPaginationProps } from '@fastgpt/web/common/fetch/type';
import { FilterQuery, Types } from 'mongoose';
import { dataFieldSelector, processChatTimeFilter } from './getQuote';

export type GetCollectionQuoteProps = LinkedPaginationProps & {
  chatTime: Date;

  isInitialLoad: boolean;
  collectionId: string;
  chatItemId: string;
  appId: string;
  chatId: string;
  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
};

export type GetCollectionQuoteRes = LinkedListResponse<DatasetDataSchemaType>;

type BaseMatchType = FilterQuery<DatasetDataSchemaType>;

async function handler(
  req: ApiRequestProps<GetCollectionQuoteProps>
): Promise<GetCollectionQuoteRes> {
  const {
    initialId,
    initialIndex,
    prevId,
    prevIndex,
    nextId,
    nextIndex,
    chatTime,

    isInitialLoad,
    collectionId,
    chatItemId,
    appId,
    chatId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    pageSize = 15
  } = req.body;
  const limitedPageSize = Math.min(pageSize, 30);

  await Promise.all([
    authChatCrud({
      req,
      authToken: true,
      appId,
      chatId,
      shareId,
      outLinkUid,
      teamId,
      teamToken
    }),
    authCollectionInChat({ appId, chatId, chatItemId, collectionId })
  ]);

  const baseMatch: BaseMatchType = {
    collectionId,
    $or: [
      { updateTime: { $lt: new Date(chatTime) } },
      { history: { $elemMatch: { updateTime: { $lt: new Date(chatTime) } } } }
    ]
  };

  if (initialId && initialIndex !== undefined) {
    return await handleInitialLoad(
      initialId,
      initialIndex,
      limitedPageSize,
      chatTime,
      chatItemId,
      isInitialLoad,
      baseMatch
    );
  }

  if ((prevId && prevIndex !== undefined) || (nextId && nextIndex !== undefined)) {
    return await handlePaginatedLoad(
      prevId,
      prevIndex,
      nextId,
      nextIndex,
      limitedPageSize,
      chatTime,
      chatItemId,
      baseMatch
    );
  }

  return { list: [], hasMorePrev: false, hasMoreNext: false };
}

export default NextAPI(handler);

async function handleInitialLoad(
  initialId: string,
  initialIndex: number,
  pageSize: number,
  chatTime: Date,
  chatItemId: string,
  isInitialLoad: boolean,
  baseMatch: BaseMatchType
): Promise<GetCollectionQuoteRes> {
  const centerNode = await MongoDatasetData.findOne(
    {
      _id: new Types.ObjectId(initialId)
    },
    dataFieldSelector
  ).lean();

  if (!centerNode) {
    if (isInitialLoad) {
      const list = await MongoDatasetData.find(baseMatch, dataFieldSelector)
        .sort({ chunkIndex: 1, _id: -1 })
        .limit(pageSize)
        .lean();

      const listRes = list.map((item, index) => ({
        ...item,
        index: item.chunkIndex
      }));

      const hasMoreNext = list.length === pageSize;

      return {
        list: listRes,
        hasMorePrev: false,
        hasMoreNext
      };
    }

    return Promise.reject('centerNode not found');
  }

  const prevHalfSize = Math.floor(pageSize / 2);
  const nextHalfSize = pageSize - prevHalfSize - 1;

  const { list: prevList, hasMore: hasMorePrev } = await getPrevNodes(
    initialId,
    initialIndex,
    prevHalfSize,
    baseMatch
  );
  const { list: nextList, hasMore: hasMoreNext } = await getNextNodes(
    initialId,
    initialIndex,
    nextHalfSize,
    baseMatch
  );

  const resultList = [...prevList, centerNode, ...nextList];

  const list = processChatTimeFilter(resultList, chatTime);

  return {
    list: list.map((item) => ({
      ...item,
      index: item.chunkIndex
    })),
    hasMorePrev,
    hasMoreNext
  };
}

async function handlePaginatedLoad(
  prevId: string | undefined,
  prevIndex: number | undefined,
  nextId: string | undefined,
  nextIndex: number | undefined,
  pageSize: number,
  chatTime: Date,
  chatItemId: string,
  baseMatch: BaseMatchType
): Promise<GetCollectionQuoteRes> {
  const { list, hasMore } =
    prevId && prevIndex !== undefined
      ? await getPrevNodes(prevId, prevIndex, pageSize, baseMatch)
      : await getNextNodes(nextId!, nextIndex!, pageSize, baseMatch);

  const processedList = processChatTimeFilter(list, chatTime);

  return {
    list: processedList.map((item) => ({
      ...item,
      index: item.chunkIndex
    })),
    hasMorePrev: !!prevId && hasMore,
    hasMoreNext: !!nextId && hasMore
  };
}

async function getPrevNodes(
  initialId: string,
  initialIndex: number,
  limit: number,
  baseMatch: BaseMatchType
) {
  const match: BaseMatchType = {
    ...baseMatch,
    $or: [
      { chunkIndex: { $lte: initialIndex } },
      { chunkIndex: initialIndex, _id: { $lte: new Types.ObjectId(initialId) } }
    ]
  };

  const list = await MongoDatasetData.find(match, dataFieldSelector)
    .sort({ chunkIndex: -1, _id: 1 })
    .limit(limit)
    .lean();

  return {
    list: list.filter((item) => String(item._id) !== initialId).reverse(),
    hasMore: list.length === limit
  };
}

async function getNextNodes(
  initialId: string,
  initialIndex: number,
  limit: number,
  baseMatch: BaseMatchType
) {
  const match: BaseMatchType = {
    ...baseMatch,
    $or: [
      { chunkIndex: { $gte: initialIndex } },
      { chunkIndex: initialIndex, _id: { $gte: new Types.ObjectId(initialId) } }
    ]
  };

  const list = await MongoDatasetData.find(match, dataFieldSelector)
    .sort({ chunkIndex: 1, _id: -1 })
    .limit(limit)
    .lean();

  return {
    list: list.filter((item) => String(item._id) !== initialId),
    hasMore: list.length === limit
  };
}
