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
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';

export type GetCollectionQuoteProps = LinkedPaginationProps<{}, number> & {
  chatId: string;
  chatItemDataId: string;

  collectionId: string;

  appId: string;
  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
};

export type GetCollectionQuoteRes = LinkedListResponse<DatasetCiteItemType, number>;

type BaseMatchType = FilterQuery<DatasetDataSchemaType>;

async function handler(
  req: ApiRequestProps<GetCollectionQuoteProps>
): Promise<GetCollectionQuoteRes> {
  const {
    initialId,
    prevId,
    nextId,
    anchor: initialAnchor,

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

  const [collection, { chat, showFullText }, chatItem] = await Promise.all([
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
    MongoChatItem.findOne({ appId, chatId, dataId: chatItemDataId }, 'time').lean(),
    authCollectionInChat({ appId, chatId, chatItemDataId, collectionIds: [collectionId] })
  ]);

  if (!showFullText || !chat || !chatItem || initialAnchor === undefined) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const baseMatch: BaseMatchType = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId,
    $or: [
      { updateTime: { $lt: new Date(chatItem.time) } },
      { history: { $elemMatch: { updateTime: { $lt: new Date(chatItem.time) } } } }
    ]
  };

  if (initialId) {
    return await handleInitialLoad({
      initialId,
      initialIndex: initialAnchor,
      pageSize: limitedPageSize,
      chatTime: chatItem.time,
      baseMatch
    });
  }

  if (prevId || nextId) {
    return await handlePaginatedLoad({
      prevId,
      nextId,
      nextAnchor: initialAnchor,
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
      .sort({ chunkIndex: 1, _id: 1 })
      .limit(pageSize)
      .lean();

    const hasMoreNext = list.length === pageSize;

    return {
      list: processChatTimeFilter(getFormatDatasetCiteList(list), chatTime).map((item) => ({
        ...item,
        id: item._id,
        anchor: item.index
      })),
      hasMorePrev: false,
      hasMoreNext
    };
  }

  const { list: prevList, hasMore: hasMorePrev } = await getPrevNodes(
    initialId,
    initialIndex,
    pageSize,
    baseMatch
  );
  const { list: nextList, hasMore: hasMoreNext } = await getNextNodes(
    initialId,
    initialIndex,
    pageSize,
    baseMatch
  );

  const resultList = [...prevList, centerNode, ...nextList];

  return {
    list: processChatTimeFilter(getFormatDatasetCiteList(resultList), chatTime).map((item) => ({
      ...item,
      id: item._id,
      anchor: item.index
    })),
    hasMorePrev,
    hasMoreNext
  };
}

async function handlePaginatedLoad({
  prevId,
  nextId,
  nextAnchor,
  pageSize,
  chatTime,
  baseMatch
}: {
  prevId: string | undefined;
  nextId: string | undefined;
  nextAnchor: number;
  pageSize: number;
  chatTime: Date;
  baseMatch: BaseMatchType;
}): Promise<GetCollectionQuoteRes> {
  const { list, hasMore } = prevId
    ? await getPrevNodes(prevId, nextAnchor, pageSize, baseMatch)
    : await getNextNodes(nextId!, nextAnchor, pageSize, baseMatch);

  const processedList = processChatTimeFilter(getFormatDatasetCiteList(list), chatTime);

  return {
    list: processedList.map((item) => ({ ...item, id: item._id, anchor: item.index })),
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
      { chunkIndex: { $lt: initialIndex } },
      // If all chunkIndex are 0, sort by id
      { chunkIndex: initialIndex, _id: { $lt: new Types.ObjectId(initialId) } }
    ]
  };

  const list = await MongoDatasetData.find(match, quoteDataFieldSelector)
    .sort({ chunkIndex: -1, _id: -1 })
    .limit(limit)
    .lean();

  return {
    list: list.reverse(),
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
      { chunkIndex: { $gt: initialIndex } },
      { chunkIndex: initialIndex, _id: { $gt: new Types.ObjectId(initialId) } }
    ]
  };

  const list = await MongoDatasetData.find(match, quoteDataFieldSelector)
    .sort({ chunkIndex: 1, _id: 1 })
    .limit(limit)
    .lean();

  return {
    list,
    hasMore: list.length === limit
  };
}
