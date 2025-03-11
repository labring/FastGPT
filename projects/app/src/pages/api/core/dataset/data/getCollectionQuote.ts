import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { LinkedListResponse, LinkedPaginationProps } from '@fastgpt/web/common/fetch/type';
import { Types } from 'mongoose';
import { dataFieldSelector, processChatTimeFilter } from './getQuote';

export type GetCollectionQuoteProps = LinkedPaginationProps & {
  initialId?: string;
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

async function handler(
  req: ApiRequestProps<GetCollectionQuoteProps>
): Promise<GetCollectionQuoteRes> {
  const {
    initialId,
    prevId,
    nextId,
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
    getCollectionWithDataset(collectionId),
    authCollectionInChat({ appId, chatId, chatItemId, collectionId })
  ]);

  if (initialId) {
    return await handleInitialLoad(
      initialId,
      limitedPageSize,
      chatTime,
      chatItemId,
      isInitialLoad,
      collectionId
    );
  }

  if (prevId || nextId) {
    return await handlePaginatedLoad(prevId, nextId, limitedPageSize, chatTime, chatItemId);
  }

  return { list: [], hasMorePrev: false, hasMoreNext: false };
}

export default NextAPI(handler);

async function handleInitialLoad(
  initialId: string,
  pageSize: number,
  chatTime: Date,
  chatItemId: string,
  isInitialLoad: boolean,
  collectionId: string
): Promise<GetCollectionQuoteRes> {
  const centerNode = await MongoDatasetData.findOne(
    {
      _id: new Types.ObjectId(initialId)
    },
    dataFieldSelector
  ).lean();

  if (!centerNode) {
    if (isInitialLoad) {
      const match = {
        collectionId,
        $or: [
          { updateTime: { $lt: new Date(chatTime) } },
          { history: { $elemMatch: { updateTime: { $lt: new Date(chatTime) } } } }
        ]
      };

      const [list, total] = await Promise.all([
        MongoDatasetData.find(match, dataFieldSelector)
          .sort({ chunkIndex: 1, updateTime: -1 })
          .limit(pageSize)
          .lean(),
        MongoDatasetData.countDocuments(match)
      ]);

      const hasMoreNext = total > pageSize;

      return {
        list,
        hasMorePrev: false,
        hasMoreNext
      };
    }

    return Promise.reject('centerNode not found');
  }

  const prevHalfSize = Math.floor(pageSize / 2);
  const nextHalfSize = pageSize - prevHalfSize - 1;

  const { nodes: prevNodes, hasMore: hasMorePrev } = await getPrevNodes(
    centerNode._id,
    prevHalfSize
  );
  const { nodes: nextNodes, hasMore: hasMoreNext } = await getNextNodes(
    centerNode._id,
    nextHalfSize
  );
  const resultList = [...prevNodes, centerNode, ...nextNodes];

  const list = processChatTimeFilter(resultList, chatTime, chatItemId);

  return {
    list,
    hasMorePrev,
    hasMoreNext
  };
}

async function handlePaginatedLoad(
  prevId: string | undefined,
  nextId: string | undefined,
  pageSize: number,
  chatTime: Date,
  chatItemId: string
): Promise<GetCollectionQuoteRes> {
  const { nodes, hasMore } = prevId
    ? await getPrevNodes(prevId, pageSize)
    : await getNextNodes(nextId!, pageSize);

  const processedList = processChatTimeFilter(nodes, chatTime, chatItemId);

  return {
    list: processedList,
    hasMorePrev: !!prevId && hasMore,
    hasMoreNext: !!nextId && hasMore
  };
}

async function getPrevNodes(targetId: string, limit: number) {
  const allPrevNodes: DatasetDataSchemaType[] = [];
  let currentTargetId = targetId;
  let hasMore = false;

  for (let i = 0; i < limit; i++) {
    const prevNode = await MongoDatasetData.findOne(
      {
        nextId: new Types.ObjectId(currentTargetId)
      },
      dataFieldSelector
    ).lean();

    if (!prevNode) break;

    allPrevNodes.push(prevNode);
    currentTargetId = prevNode._id.toString();

    // 检查是否还有更多前置节点
    if (i === limit - 1) {
      const morePrevExists = await MongoDatasetData.findOne(
        { nextId: new Types.ObjectId(currentTargetId) },
        { _id: 1 }
      ).lean();
      hasMore = !!morePrevExists;
    }
  }

  return {
    nodes: allPrevNodes.reverse(),
    hasMore
  };
}

async function getNextNodes(targetId: string, limit: number) {
  const allNextNodes: DatasetDataSchemaType[] = [];
  let hasMore = false;

  const currentNode = await MongoDatasetData.findOne(
    { _id: new Types.ObjectId(targetId) },
    dataFieldSelector
  ).lean();
  let currentTargetId = currentNode?.nextId;

  for (let i = 0; i < limit; i++) {
    const nextNode = await MongoDatasetData.findOne(
      { _id: new Types.ObjectId(currentTargetId) },
      dataFieldSelector
    ).lean();

    if (!nextNode) break;

    allNextNodes.push(nextNode);

    if (!nextNode.nextId) break;

    currentTargetId = nextNode.nextId.toString();

    // 检查是否还有更多后续节点
    if (i === limit - 1) {
      hasMore = true;
    }
  }

  return {
    nodes: allNextNodes,
    hasMore
  };
}
