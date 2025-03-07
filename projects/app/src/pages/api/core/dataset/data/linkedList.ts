import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { Types } from 'mongoose';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { LinkedListResponse, LinkedPaginationProps } from '@fastgpt/web/common/fetch/type';

export type GetLinkedDatasetDataProps = LinkedPaginationProps & {
  collectionId?: string;
  datasetDataIdList?: string[];
  initialId?: string;
  chatTime?: Date;
  chatItemId?: string;
  shareId?: string;
  outLinkUid?: string;
};

export type GetLinkedDatasetDataRes = LinkedListResponse<DatasetDataSchemaType>;

const dataFieldSelector =
  '_id datasetId collectionId q a chunkIndex history updateTime currentChatItemId prevId nextId';

async function handler(
  req: ApiRequestProps<GetLinkedDatasetDataProps>
): Promise<GetLinkedDatasetDataRes> {
  const {
    pageSize = 15,
    initialId,
    anchorId,

    collectionId,
    datasetDataIdList,
    direction = 'next',
    chatTime,
    chatItemId,
    shareId,
    outLinkUid
  } = req.body;

  const limitedPageSize = Math.min(pageSize, 30);
  let baseQuery;

  if (datasetDataIdList?.length) {
    if (shareId || outLinkUid) {
      await authOutLink({ shareId, outLinkUid });
    }

    const list = await MongoDatasetData.find({ _id: { $in: datasetDataIdList } }, dataFieldSelector)
      .sort({ chunkIndex: 1, updateTime: -1 })
      .limit(limitedPageSize)
      .lean();

    const processedList = processChatTimeFilter(list, chatTime, chatItemId);

    return {
      list: processedList,
      hasMorePrev: false,
      hasMoreNext: false
    };
  }

  // 验证集合ID
  if (!collectionId) {
    throw new Error('collectionId is required');
  }

  if (shareId || outLinkUid) {
    await authOutLink({ shareId, outLinkUid });
    baseQuery = { collectionId };
  } else {
    const authResult = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: ReadPermissionVal
    });

    baseQuery = {
      teamId: authResult.teamId,
      datasetId: authResult.collection.datasetId,
      collectionId
    };
  }

  // 添加时间过滤条件
  if (chatTime) {
    baseQuery = {
      ...baseQuery,
      $or: [
        { updateTime: { $lt: new Date(chatTime) } },
        { history: { $elemMatch: { updateTime: { $lt: new Date(chatTime) } } } }
      ]
    };
  }

  try {
    // 初始加载 - 首次进入时需要获取中心点附近的数据
    if (initialId) {
      return await handleInitialLoad(initialId, limitedPageSize, baseQuery, chatTime, chatItemId);
    }

    // 分页加载 - 基于锚点向特定方向加载更多
    if (anchorId) {
      return await handlePaginatedLoad(
        anchorId,
        direction,
        limitedPageSize,
        baseQuery,
        chatTime,
        chatItemId
      );
    }

    return { list: [], hasMorePrev: false, hasMoreNext: false };
  } catch (error) {
    console.error('Error in linkedList handler:', error);
    return { list: [], hasMorePrev: false, hasMoreNext: false };
  }
}

// 处理初始加载
async function handleInitialLoad(
  initialId: string,
  pageSize: number,
  baseQuery: Record<string, any>,
  chatTime?: Date,
  chatItemId?: string
): Promise<GetLinkedDatasetDataRes> {
  try {
    const centerNode = await MongoDatasetData.findOne(
      {
        _id: new Types.ObjectId(initialId),
        ...baseQuery
      },
      dataFieldSelector
    ).lean();

    if (!centerNode) {
      return { list: [], hasMorePrev: false, hasMoreNext: false };
    }

    const prevHalfSize = Math.floor(pageSize / 2);
    const nextHalfSize = pageSize - prevHalfSize;

    const prevNodes = await getPrevNodes(centerNode._id, prevHalfSize, baseQuery);
    const nextNodes = await getNextNodes(centerNode, nextHalfSize - 1, baseQuery);
    const resultList = [...prevNodes, centerNode, ...nextNodes];

    const hasMorePrev = prevNodes.length >= prevHalfSize;
    const hasMoreNext =
      nextNodes.length >= nextHalfSize - 1 && !!nextNodes[nextNodes.length - 1]?.nextId;

    const processedList = processChatTimeFilter(resultList, chatTime, chatItemId);

    return {
      list: processedList,
      hasMorePrev,
      hasMoreNext
    };
  } catch (error) {
    console.error('Error loading initial data:', error);
    return { list: [], hasMorePrev: false, hasMoreNext: false };
  }
}

// 处理分页加载
async function handlePaginatedLoad(
  anchorId: string,
  direction: 'prev' | 'next',
  pageSize: number,
  baseQuery: any,
  chatTime?: Date,
  chatItemId?: string
): Promise<GetLinkedDatasetDataRes> {
  try {
    const anchorNode = await MongoDatasetData.findOne(
      {
        _id: new Types.ObjectId(anchorId),
        ...baseQuery
      },
      dataFieldSelector
    ).lean();

    if (!anchorNode) {
      return { list: [], hasMorePrev: false, hasMoreNext: false };
    }

    let nodes = [];
    let hasMore = false;

    if (direction === 'next') {
      nodes = await getNextNodes(anchorNode, pageSize, baseQuery);
      hasMore = nodes.length >= pageSize && !!nodes[nodes.length - 1]?.nextId;
    } else {
      nodes = await getPrevNodes(anchorNode._id, pageSize, baseQuery);
      hasMore = nodes.length >= pageSize;
    }

    const processedList = processChatTimeFilter(nodes, chatTime, chatItemId);

    return {
      list: processedList,
      hasMorePrev: direction === 'prev' ? hasMore : true,
      hasMoreNext: direction === 'next' ? hasMore : true
    };
  } catch (error) {
    console.error('Error loading paginated data:', error);
    return { list: [], hasMorePrev: false, hasMoreNext: false };
  }
}

async function getPrevNodes(targetId: string, limit: number, baseQuery: any) {
  if (limit <= 0) return [];

  try {
    const allPrevNodes: DatasetDataSchemaType[] = [];
    let targetIds = [targetId];
    let remainingCount = limit;

    while (remainingCount > 0 && targetIds.length > 0) {
      const prevNodes = await MongoDatasetData.find(
        {
          nextId: { $in: targetIds },
          ...baseQuery
        },
        dataFieldSelector
      ).lean();

      if (prevNodes.length === 0) break;

      allPrevNodes.push(...prevNodes);
      remainingCount -= prevNodes.length;

      targetIds = prevNodes.map((node) => node._id);

      if (remainingCount <= 0) break;
    }

    allPrevNodes.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));

    return allPrevNodes.slice(-limit);
  } catch (error) {
    console.error('Error fetching prev nodes:', error);
    return [];
  }
}

async function getNextNodes(startNode: any, limit: number, baseQuery: any) {
  try {
    const result: DatasetDataSchemaType[] = [];
    let currentId = startNode.nextId;

    const idChain = [];
    let currentNode: { _id: any; nextId: any } | null = null;

    for (let i = 0; i < limit; i++) {
      idChain.push(currentId);

      currentNode = await MongoDatasetData.findOne(
        { _id: currentId, ...baseQuery },
        '_id nextId'
      ).lean();

      if (!currentNode || !currentNode.nextId) break;
      currentId = currentNode.nextId;
    }

    if (idChain.length === 0) return result;

    const nodes = await MongoDatasetData.find(
      { _id: { $in: idChain }, ...baseQuery },
      dataFieldSelector
    ).lean();

    const nodeMap = new Map(nodes.map((node) => [node._id.toString(), node]));

    currentId = startNode.nextId;
    for (let i = 0; i < limit && currentId; i++) {
      const node = nodeMap.get(currentId.toString());
      if (!node) break;

      result.push(node);
      currentId = node.nextId;
    }

    return result;
  } catch (error) {
    console.error('Error fetching next nodes:', error);
    return [];
  }
}

function processChatTimeFilter(list: any[], chatTime?: Date, chatItemId?: string) {
  if (!chatTime) return list;

  return list.map((item) => {
    if (!item.history) return item;

    const { history, ...rest } = item;
    const formatedChatTime = new Date(chatTime);

    // 如果当前版本在指定时间之前，直接使用当前版本
    if (item.updateTime <= formatedChatTime) {
      return rest;
    }

    // 查找指定时间点前的最新历史版本
    const latestHistoryIndex = history.findIndex(
      (historyItem: any) => historyItem.updateTime <= formatedChatTime
    );

    // 没有符合条件的历史版本
    if (latestHistoryIndex === -1) return rest;

    // 检查是否有特定聊天项的历史版本
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

export default NextAPI(handler);
