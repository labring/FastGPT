import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import {
  type DatasetCiteItemType,
  type DatasetDataSchemaType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  type LinkedListResponse,
  type LinkedPaginationProps
} from '@fastgpt/web/common/fetch/type';
import { type FilterQuery, Types } from 'mongoose';
import { quoteDataFieldSelector } from '@/service/core/chat/constants';
import { processChatTimeFilter } from '@/service/core/chat/utils';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { getFormatDatasetCiteList } from '@fastgpt/service/core/dataset/data/controller';

export type GetCollectionQuoteProps = LinkedPaginationProps & {
  chatId: string;
  chatItemDataId: string;

  collectionId: string;

  appId: string;
  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
};

export type GetCollectionQuoteRes = LinkedListResponse<DatasetCiteItemType>;

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

    collectionId,
    chatItemDataId,
    appId,
    chatId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    pageSize = 15
  } = req.body;

  const limitedPageSize = Math.min(pageSize, 30);

  const [collection, { chat, showRawSource }, { chatItem }] = await Promise.all([
    getCollectionWithDataset(collectionId),
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
    authCollectionInChat({ appId, chatId, chatItemDataId, collectionIds: [collectionId] })
  ]);
  if (!showRawSource) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }
  if (!chat) return Promise.reject(ChatErrEnum.unAuthChat);

  const baseMatch: BaseMatchType = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId,
    $or: [
      { updateTime: { $lt: new Date(chatItem.time) } },
      { history: { $elemMatch: { updateTime: { $lt: new Date(chatItem.time) } } } }
    ]
  };

  if (initialId && initialIndex !== undefined) {
    return await handleInitialLoad({
      initialId,
      initialIndex,
      pageSize: limitedPageSize,
      chatTime: chatItem.time,
      baseMatch
    });
  }

  if ((prevId && prevIndex !== undefined) || (nextId && nextIndex !== undefined)) {
    return await handlePaginatedLoad({
      prevId,
      prevIndex,
      nextId,
      nextIndex,
      pageSize: limitedPageSize,
      chatTime: chatItem.time,
      baseMatch
    });
  }

  return { list: [], hasMorePrev: false, hasMoreNext: false };
}

export default NextAPI(handler);

async function handleInitialLoad({
  initialId,
  initialIndex,
  pageSize,
  chatTime,
  baseMatch
}: {
  initialId: string;
  initialIndex: number;
  pageSize: number;
  chatTime: Date;
  baseMatch: BaseMatchType;
}): Promise<GetCollectionQuoteRes> {
  const centerNode = await MongoDatasetData.findOne(
    {
      _id: new Types.ObjectId(initialId)
    },
    quoteDataFieldSelector
  ).lean();

  if (!centerNode) {
    const list = await MongoDatasetData.find(baseMatch, quoteDataFieldSelector)
      .sort({ chunkIndex: 1, _id: -1 })
      .limit(pageSize)
      .lean();

    const hasMoreNext = list.length === pageSize;

    return {
      list: processChatTimeFilter(getFormatDatasetCiteList(list), chatTime),
      hasMorePrev: false,
      hasMoreNext
    };
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

  return {
    list: processChatTimeFilter(getFormatDatasetCiteList(resultList), chatTime),
    hasMorePrev,
    hasMoreNext
  };
}

async function handlePaginatedLoad({
  prevId,
  prevIndex,
  nextId,
  nextIndex,
  pageSize,
  chatTime,
  baseMatch
}: {
  prevId: string | undefined;
  prevIndex: number | undefined;
  nextId: string | undefined;
  nextIndex: number | undefined;
  pageSize: number;
  chatTime: Date;
  baseMatch: BaseMatchType;
}): Promise<GetCollectionQuoteRes> {
  const { list, hasMore } =
    prevId && prevIndex !== undefined
      ? await getPrevNodes(prevId, prevIndex, pageSize, baseMatch)
      : await getNextNodes(nextId!, nextIndex!, pageSize, baseMatch);

  const processedList = processChatTimeFilter(getFormatDatasetCiteList(list), chatTime);

  return {
    list: processedList,
    hasMorePrev: !!prevId && hasMore,
    hasMoreNext: !!nextId && hasMore
  };
}

async function getPrevNodes(
  initialId: string,
  initialIndex: number,
  limit: number,
  baseMatch: BaseMatchType
): Promise<{
  list: DatasetDataSchemaType[];
  hasMore: boolean;
}> {
  const match: BaseMatchType = {
    ...baseMatch,
    $or: [
      { chunkIndex: { $lte: initialIndex } },
      { chunkIndex: initialIndex, _id: { $lte: new Types.ObjectId(initialId) } }
    ]
  };

  const list = await MongoDatasetData.find(match, quoteDataFieldSelector)
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
): Promise<{
  list: DatasetDataSchemaType[];
  hasMore: boolean;
}> {
  const match: BaseMatchType = {
    ...baseMatch,
    $or: [
      { chunkIndex: { $gte: initialIndex } },
      { chunkIndex: initialIndex, _id: { $gte: new Types.ObjectId(initialId) } }
    ]
  };

  const list = await MongoDatasetData.find(match, quoteDataFieldSelector)
    .sort({ chunkIndex: 1, _id: -1 })
    .limit(limit)
    .lean();

  return {
    list: list.filter((item) => String(item._id) !== initialId),
    hasMore: list.length === limit
  };
}
