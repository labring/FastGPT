import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { Types } from 'mongoose';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';

export interface GetLinkedDatasetDataProps {
  collectionId?: string; // 集合 ID
  datasetDataIdList?: string[]; // 数据 ID 列表
  initialId?: string; // 初始中心点 ID (用于首次加载)
  anchorId?: string; // 锚点 ID (用于分页加载)
  direction?: 'prev' | 'next';
  pageSize?: number;
  chatTime?: Date;
  chatItemId?: string;
  shareId?: string;
  outLinkUid?: string;
}

export interface GetLinkedDatasetDataRes<T = any> {
  list: T[];
  hasMorePrev: boolean;
  hasMoreNext: boolean;
}

const dataFieldSelector =
  '_id datasetId collectionId q a chunkIndex history updateTime currentChatItemId prevId nextId';

async function handler(
  req: ApiRequestProps<GetLinkedDatasetDataProps>
): Promise<GetLinkedDatasetDataRes> {
  const {
    collectionId,
    datasetDataIdList,
    initialId,
    anchorId,
    direction = 'next',
    pageSize = 15,
    chatTime,
    chatItemId,
    shareId,
    outLinkUid
  } = req.body;

  const limitedPageSize = Math.min(pageSize, 30);
  let teamId, baseQuery;

  if (datasetDataIdList?.length) {
    // 验证外链权限 - 适用于分享链接和外部访问
    if (shareId || outLinkUid) {
      await authOutLink({ shareId, outLinkUid });
    }

    const list = await MongoDatasetData.find({ _id: { $in: datasetDataIdList } }, dataFieldSelector)
      .sort({ chunkIndex: 1, updateTime: -1 })
      .limit(limitedPageSize)
      .lean();

    // 处理历史数据
    const processedList = processChatTimeFilter(list, chatTime, chatItemId);

    return {
      list: processedList,
      hasMorePrev: false,
      hasMoreNext: false
    };
  }

  if (!collectionId) {
    throw new Error('collectionId is required');
  }

  if (shareId || outLinkUid) {
    await authOutLink({ shareId, outLinkUid });
    // 由于外链没有teamId，使用简化查询
    baseQuery = { collectionId };
  } else {
    // 常规权限验证
    const authResult = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: ReadPermissionVal
    });

    teamId = authResult.teamId;
    baseQuery = {
      teamId,
      datasetId: authResult.collection.datasetId,
      collectionId
    };
  }

  if (chatTime) {
    baseQuery = {
      ...baseQuery,
      $or: [
        { updateTime: { $lt: new Date(chatTime) } },
        { history: { $elemMatch: { updateTime: { $lt: new Date(chatTime) } } } }
      ]
    };
  }

  // 初始加载 - 首次进入时需要获取中心点附近的数据
  if (initialId) {
    try {
      // 查找中心点节点
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

      // 向前获取一半数据
      const prevHalfSize = Math.floor(limitedPageSize / 2);
      const prevNodes = await getNodesInDirection(centerNode, 'prev', prevHalfSize, baseQuery);

      // 向后获取剩余数据 (包括中心点)
      const nextHalfSize = limitedPageSize - prevNodes.length;
      const nextNodes = await getNodesInDirection(centerNode, 'next', nextHalfSize - 1, baseQuery);

      // 组合结果，中心点在中间
      const resultList = [...prevNodes.reverse(), centerNode, ...nextNodes];

      // 确定是否还有更多数据
      const hasMorePrev = prevNodes.length > 0 && !!prevNodes[0].prevId;
      const hasMoreNext = nextNodes.length > 0 && !!nextNodes[nextNodes.length - 1].nextId;

      // 处理历史数据
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

  // 分页加载 - 基于锚点向特定方向加载更多
  if (anchorId) {
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

      // 根据方向获取下一批数据
      const nodes = await getNodesInDirection(anchorNode, direction, limitedPageSize, baseQuery);

      // 确定是否还有更多数据
      const hasMore =
        nodes.length > 0 && !!nodes[nodes.length - 1][direction === 'next' ? 'nextId' : 'prevId'];

      // 处理历史数据
      const processedList = processChatTimeFilter(
        direction === 'prev' ? nodes.reverse() : nodes,
        chatTime,
        chatItemId
      );

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

  // 没有提供 initialId 或anchorId - 从链表头开始加载
  try {
    const headNode = await MongoDatasetData.findOne(
      {
        ...baseQuery,
        prevId: { $exists: false } // 查找链表头部
      },
      dataFieldSelector
    ).lean();

    if (!headNode) {
      // 如果找不到明确的头节点，尝试获取任意节点作为起点
      const anyNode = await MongoDatasetData.findOne(baseQuery, dataFieldSelector)
        .sort({ chunkIndex: 1, createdAt: 1 })
        .lean();

      if (!anyNode) {
        return { list: [], hasMorePrev: false, hasMoreNext: false };
      }

      // 以任意节点为起点向后加载
      const nodes = await getNodesInDirection(anyNode, 'next', limitedPageSize - 1, baseQuery);
      const resultList = [anyNode, ...nodes];

      // 处理历史数据
      const processedList = processChatTimeFilter(resultList, chatTime, chatItemId);

      return {
        list: processedList,
        hasMorePrev: !!anyNode.prevId,
        hasMoreNext: nodes.length > 0 && !!nodes[nodes.length - 1].nextId
      };
    }

    // 从头节点开始加载
    const nodes = await getNodesInDirection(headNode, 'next', limitedPageSize - 1, baseQuery);
    const resultList = [headNode, ...nodes];

    // 处理历史数据
    const processedList = processChatTimeFilter(resultList, chatTime, chatItemId);

    return {
      list: processedList,
      hasMorePrev: false, // 头节点前面没有更多数据
      hasMoreNext: nodes.length > 0 && !!nodes[nodes.length - 1].nextId
    };
  } catch (error) {
    console.error('Error loading head data:', error);
    return { list: [], hasMorePrev: false, hasMoreNext: false };
  }
}

// 工具函数：沿指定方向获取节点
async function getNodesInDirection(
  startNode: any,
  direction: 'prev' | 'next',
  count: number,
  baseQuery: any
) {
  const result: DatasetDataSchemaType[] = [];
  let currentId = startNode[`${direction}Id`];

  // 没有更多节点
  if (!currentId) return result;

  try {
    // 使用批量查询优化性能
    const idChain = [currentId];
    for (let i = 1; i < count; i++) {
      const node = await MongoDatasetData.findOne(
        { _id: currentId, ...baseQuery },
        `_id ${direction}Id`
      ).lean();

      if (!node || !node[`${direction}Id`]) break;
      currentId = node[`${direction}Id`];
      idChain.push(currentId);
    }

    if (idChain.length === 0) return result;

    // 批量查询所有ID
    const nodes = await MongoDatasetData.find(
      { _id: { $in: idChain }, ...baseQuery },
      dataFieldSelector
    ).lean();

    // 按照链表顺序排列结果
    const nodeMap = new Map(nodes.map((node) => [node._id.toString(), node]));
    currentId = startNode[`${direction}Id`];

    for (let i = 0; i < count && currentId; i++) {
      const node = nodeMap.get(currentId.toString());
      if (!node) break;

      result.push(node);
      currentId = node[`${direction}Id`];
    }

    return result;
  } catch (error) {
    console.error(`Error fetching nodes in ${direction} direction:`, error);
    return result;
  }
}

// 工具函数：处理基于聊天时间的历史数据筛选
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
