import { NextAPI } from '@/service/middleware/entry';
import { authCollectionInChat } from '@/service/support/permission/auth/chat';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { type DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { type FilterQuery, Types } from 'mongoose';
import { quoteDataFieldSelector } from '@/service/core/chat/constants';
import { processChatTimeFilter } from '@/service/core/chat/utils';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { getFormatDatasetCiteList } from '@fastgpt/service/core/dataset/data/controller';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import {
  GetCollectionQuoteBodySchema,
  type GetCollectionQuoteResType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

type BaseMatchType = FilterQuery<DatasetDataSchemaType>;

async function handler(req: ApiRequestProps): Promise<GetCollectionQuoteResType> {
  const {
    initialId,
    prevId,
    nextId,
    anchor: initialAnchor,

    collectionId,
    chatItemDataId,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    pageSize
  } = parseApiInput({ req, bodySchema: GetCollectionQuoteBodySchema }).body;

  const limitedPageSize = pageSize;

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  const resolvedSourceId = authRes.sourceId;

  const [collection, chatItem] = await Promise.all([
    getCollectionWithDataset(collectionId),
    MongoChatItem.findOne(
      {
        ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }),
        chatId,
        dataId: chatItemDataId
      },
      'time'
    ).lean(),
    authCollectionInChat({
      sourceType,
      sourceId: resolvedSourceId,
      chatId,
      collectionIds: [collectionId]
    })
  ]);

  if (!authRes.showFullText || !authRes.chat || !chatItem || initialAnchor === undefined) {
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
}): Promise<GetCollectionQuoteResType> {
  const centerNode = await MongoDatasetData.findOne(
    {
      ...baseMatch,
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
    const citeList = await getFormatDatasetCiteList(list);

    return {
      list: processChatTimeFilter(citeList, chatTime).map((item) => ({
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
  const citeList = await getFormatDatasetCiteList(resultList);

  return {
    list: processChatTimeFilter(citeList, chatTime).map((item) => ({
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
}): Promise<GetCollectionQuoteResType> {
  const { list, hasMore } = prevId
    ? await getPrevNodes(prevId, nextAnchor, pageSize, baseMatch)
    : await getNextNodes(nextId!, nextAnchor, pageSize, baseMatch);

  const citeList = await getFormatDatasetCiteList(list);
  const processedList = processChatTimeFilter(citeList, chatTime);

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
