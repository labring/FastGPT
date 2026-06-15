import type { ChatHistoryItemResType } from '../type';

const deprecatedChildrenResponseFields = [
  'pluginDetail',
  'toolDetail',
  'loopDetail',
  'parallelDetail',
  'loopRunDetail'
] as const;

// 新数据统一使用 childrenResponses；历史 detail 字段只在读取旧数据、
// 旧会话追加合并、递归统计时保留兼容，不再作为新的嵌套写入结构。
export const childrenResponseFields = [
  'childrenResponses',
  ...deprecatedChildrenResponseFields
] as const;

export type ChildrenResponseField = (typeof childrenResponseFields)[number];

/** 获取所有历史兼容 child 字段里的节点响应，返回顺序作为详情展示和统计顺序使用。 */
export const getChildrenResponses = (item: ChatHistoryItemResType) =>
  childrenResponseFields.flatMap((key) => item[key] || []);

const NODE_RESPONSE_INCREMENT_NUMBER_FIELDS = [
  'runningTime',
  'totalPoints',
  'childResponseCount',
  'tokens',
  'inputTokens',
  'outputTokens',
  'toolCallInputTokens',
  'toolCallOutputTokens',
  'embeddingTokens',
  'reRankInputTokens',
  'extensionTokens'
] as const;

export const getNodeResponseIdentityKey = (response: ChatHistoryItemResType) =>
  `${response.id || ''}\u0000${response.parentId || ''}`;

const isSameNodeResponseIdentity = (
  current: ChatHistoryItemResType,
  incoming: ChatHistoryItemResType
) =>
  !!current.id &&
  !!incoming.id &&
  getNodeResponseIdentityKey(current) === getNodeResponseIdentityKey(incoming);

const hasRootParentDependency = (responses: ChatHistoryItemResType[]) => {
  const rootIds = new Set(responses.flatMap((response) => (response.id ? [response.id] : [])));

  return responses.some(
    (response) =>
      response.parentId && response.parentId !== response.id && rootIds.has(response.parentId)
  );
};

/**
 * 合并同一个 child 字段下的 sibling nodes。
 *
 * 旧实现会把 current + incoming 从空数组重新走一遍 appendNodeResponseByParent；
 * 当同一个节点多次增量且每次都带大量 childrenResponses 时，会反复扫描并复制整棵 child 树。
 * 这里优先在同层用 `id + parentId` 建索引合并，只有发现 sibling 之间还存在 parent 依赖时
 * 才回退到完整挂树逻辑，保留 child 先到、parent 后到的兼容语义。
 */
function mergeChildResponseList(
  current: ChatHistoryItemResType[] = [],
  incoming: ChatHistoryItemResType[] = []
): ChatHistoryItemResType[] {
  const responses = [...current, ...incoming];
  if (responses.length === 0) return [];

  if (hasRootParentDependency(responses)) return mergeNodeResponseListByParent(responses);

  return mergeNodeResponsesByIdentity(responses);
}

function mergeNodeResponsesByIdentity(responses: ChatHistoryItemResType[]) {
  const indexByIdentity = new Map<string, number>();
  return responses.reduce<ChatHistoryItemResType[]>((list, child) => {
    if (!child.id) {
      list.push(child);
      return list;
    }

    const identity = getNodeResponseIdentityKey(child);
    const existingIndex = indexByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexByIdentity.set(identity, list.length);
      list.push(child);
      return list;
    }

    list[existingIndex] = mergeNodeResponse(list[existingIndex], child);
    return list;
  }, []);
}

function attachNodeResponsesByParent(responses: ChatHistoryItemResType[]) {
  const parentById = new Map<string, ChatHistoryItemResType>();

  responses.forEach((response) => {
    if (response.id && !parentById.has(response.id)) {
      parentById.set(response.id, response);
    }
  });

  return responses.reduce<ChatHistoryItemResType[]>((roots, response) => {
    const parent =
      response.parentId && response.parentId !== response.id
        ? parentById.get(response.parentId)
        : undefined;
    if (!parent) return [...roots, response];

    parent.childrenResponses = mergeChildResponseList(parent.childrenResponses || [], [
      {
        ...response,
        parentId: response.parentId
      }
    ]);
    return roots;
  }, []);
}

/**
 * 批量读取时使用的一次性挂树算法。
 *
 * 与流式 append 不同，详情读取已经拿到了完整 rows，可以先按 `id + parentId` 合并同层
 * 增量，再按 parentId 一次性挂到 `childrenResponses`。这样避免每条 row 都递归扫描已构建
 * 的整棵树，在 loop/parallel 产生大量 rows 时把复杂度从接近 O(n^2) 降到线性扫描为主。
 */
function mergeNodeResponseListByParent(
  responseDataList: ChatHistoryItemResType[] = []
): ChatHistoryItemResType[] {
  const normalizedResponses = responseDataList.map(normalizeNodeResponseChildren);
  return attachNodeResponsesByParent(mergeNodeResponsesByIdentity(normalizedResponses));
}

/**
 * 合并同一个 nodeResponse 的增量数据。
 *
 * SSE、恢复生成、旧会话 append 都可能多次收到相同 `id` 的节点结果：标量字段以后
 * 到达的 incoming 为准，子节点则递归按 `id/parentId` 合并，避免后续增量覆盖掉
 * 已经挂载好的 childrenResponses。历史 detail 字段只做兼容合并。
 */
const mergeNodeResponse = (
  current: ChatHistoryItemResType,
  incoming: ChatHistoryItemResType
): ChatHistoryItemResType => {
  const childrenResponses = mergeChildResponseList(
    current.childrenResponses,
    incoming.childrenResponses
  );

  const mergedLegacyChildren = childrenResponseFields.reduce<Partial<ChatHistoryItemResType>>(
    (acc, field) => {
      if (field === 'childrenResponses') return acc;
      const merged = mergeChildResponseList(
        current[field] as ChatHistoryItemResType[] | undefined,
        incoming[field] as ChatHistoryItemResType[] | undefined
      );

      return merged.length > 0 ? { ...acc, [field]: merged } : acc;
    },
    {}
  );

  const merged: ChatHistoryItemResType = {
    ...current,
    ...incoming,
    ...mergedLegacyChildren,
    ...(childrenResponses.length > 0 ? { childrenResponses } : {})
  };

  NODE_RESPONSE_INCREMENT_NUMBER_FIELDS.forEach((field) => {
    const currentValue = current[field];
    const incomingValue = incoming[field];
    const total =
      (typeof currentValue === 'number' ? currentValue : 0) +
      (typeof incomingValue === 'number' ? incomingValue : 0);
    if (typeof currentValue === 'number' || typeof incomingValue === 'number') {
      (merged as Record<string, unknown>)[field] =
        field === 'runningTime' ? +total.toFixed(2) : total;
    }
  });

  const llmRequestIds = [...(current.llmRequestIds || []), ...(incoming.llmRequestIds || [])];
  if (llmRequestIds.length > 0) {
    merged.llmRequestIds = Array.from(new Set(llmRequestIds));
  }

  if (current.compressTextAgent || incoming.compressTextAgent) {
    merged.compressTextAgent = {
      inputTokens:
        (current.compressTextAgent?.inputTokens || 0) +
        (incoming.compressTextAgent?.inputTokens || 0),
      outputTokens:
        (current.compressTextAgent?.outputTokens || 0) +
        (incoming.compressTextAgent?.outputTokens || 0),
      totalPoints:
        (current.compressTextAgent?.totalPoints || 0) +
        (incoming.compressTextAgent?.totalPoints || 0)
    };
  }

  const deepSearchModel = incoming.deepSearchResult?.model || current.deepSearchResult?.model;
  if (deepSearchModel) {
    merged.deepSearchResult = {
      ...(current.deepSearchResult || {}),
      ...(incoming.deepSearchResult || {}),
      model: deepSearchModel,
      inputTokens:
        (current.deepSearchResult?.inputTokens || 0) +
        (incoming.deepSearchResult?.inputTokens || 0),
      outputTokens:
        (current.deepSearchResult?.outputTokens || 0) +
        (incoming.deepSearchResult?.outputTokens || 0)
    };
  }

  return merged;
};

/**
 * 从响应树中递归移除匹配节点，并返回被移除节点。
 *
 * 这个 helper 主要服务于两类场景：
 * 1. 收到相同 `id` 的增量时，先摘出旧节点再和新节点合并；
 * 2. parent 后到达时，回收之前临时挂在 root 层的 orphan child。
 */
const removeNodeResponses = (
  responses: ChatHistoryItemResType[],
  predicate: (response: ChatHistoryItemResType) => boolean
): {
  responses: ChatHistoryItemResType[];
  removed: ChatHistoryItemResType[];
} => {
  const removed: ChatHistoryItemResType[] = [];

  const nextResponses = responses.flatMap((response) => {
    if (predicate(response)) {
      removed.push(response);
      return [];
    }

    const childResults = childrenResponseFields.reduce<Partial<ChatHistoryItemResType>>(
      (acc, field: ChildrenResponseField) => {
        const childResponses = response[field] as ChatHistoryItemResType[] | undefined;
        if (!childResponses?.length) return acc;

        const childResult = removeNodeResponses(childResponses, predicate);
        removed.push(...childResult.removed);
        return {
          ...acc,
          [field]: childResult.responses
        };
      },
      {}
    );

    return [{ ...response, ...childResults }];
  });

  return {
    responses: nextResponses,
    removed
  };
};

/**
 * 在同一层级中按 `id` 合并 nodeResponse。
 *
 * 有 `id` 且已存在时合并，未命中则追加到末尾；这样既能去重，又能保持流式
 * 到达顺序，供前端详情展示和后端读取拼树复用。
 */
const mergeNodeResponseList = (
  responses: ChatHistoryItemResType[],
  incoming: ChatHistoryItemResType
): ChatHistoryItemResType[] => {
  let merged = false;

  const nextResponses = responses.map((response) => {
    if (isSameNodeResponseIdentity(response, incoming)) {
      merged = true;
      return mergeNodeResponse(response, incoming);
    }
    return response;
  });

  return merged ? nextResponses : [...responses, incoming];
};

/**
 * 将增量 nodeResponse 按 `parentId` 插入到 `childrenResponses`，用于 SSE 和恢复生成合并。
 *
 * 流式响应可能先收到 child、后收到 parent；此时 child 会先作为临时 root 保留，
 * parent 到达后再按 `id` 回收并挂到 `childrenResponses`，避免客户端丢失乱序增量。
 */
export const appendNodeResponseByParent = (
  responses: ChatHistoryItemResType[] = [],
  nodeResponse: ChatHistoryItemResType
): ChatHistoryItemResType[] => {
  const nodeResponseId = nodeResponse.id;

  // 同一个节点可能被多次推送，先从整棵树中摘出旧版本，再与新版本合并。
  const duplicateResult = nodeResponseId
    ? removeNodeResponses(responses, (response) =>
        isSameNodeResponseIdentity(response, nodeResponse)
      )
    : { responses, removed: [] };
  const mergedIncoming = duplicateResult.removed.reduce(
    (current, removed) => mergeNodeResponse(removed, current),
    nodeResponse
  );

  // child 可能比 parent 更早到达并临时出现在 root 层；parent 到达后回收这些 orphan。
  const orphanResult = nodeResponseId
    ? removeNodeResponses(
        duplicateResult.responses,
        (response) => response.parentId === nodeResponseId
      )
    : { responses: duplicateResult.responses, removed: [] };
  const incomingWithChildren = orphanResult.removed.reduce(
    (current, child) => ({
      ...current,
      childrenResponses: mergeNodeResponseList(current.childrenResponses || [], child)
    }),
    mergedIncoming
  );

  const parentId = nodeResponse.parentId;
  if (!parentId) {
    return mergeNodeResponseList(orphanResult.responses, incomingWithChildren);
  }

  let inserted = false;

  // parent 可能位于任意层级或旧 detail 字段中，因此需要递归查找所有兼容 child 字段。
  const insert = (items: ChatHistoryItemResType[]): ChatHistoryItemResType[] =>
    items.map((item) => {
      if (item.id === parentId) {
        inserted = true;
        return {
          ...item,
          childrenResponses: mergeNodeResponseList(item.childrenResponses || [], {
            ...incomingWithChildren,
            parentId
          })
        };
      }

      const nextItem = childrenResponseFields.reduce<ChatHistoryItemResType>(
        (currentItem, field: ChildrenResponseField) => {
          const childResponses = currentItem[field] as ChatHistoryItemResType[] | undefined;
          if (!childResponses?.length) return currentItem;

          return {
            ...currentItem,
            [field]: insert(childResponses)
          };
        },
        item
      );

      return nextItem;
    });

  const nextResponses = insert(orphanResult.responses);
  // 找不到 parent 时保留为临时 root，等待后续 parent 增量到达后再回收挂载。
  return inserted ? nextResponses : [...orphanResult.responses, incomingWithChildren];
};

const normalizeNodeResponseChildren = (
  response: ChatHistoryItemResType
): ChatHistoryItemResType => {
  const normalizedChildren = childrenResponseFields.reduce<Partial<ChatHistoryItemResType>>(
    (acc, field) => {
      const children = response[field] as ChatHistoryItemResType[] | undefined;
      if (!children?.length) return acc;

      const mergedChildren = mergeNodeResponseDataByIdAndParent(children);
      return mergedChildren.length > 0 ? { ...acc, [field]: mergedChildren } : acc;
    },
    {}
  );

  return {
    ...response,
    ...normalizedChildren
  };
};

const stripChildTotalPoints = (item: ChatHistoryItemResType): ChatHistoryItemResType => {
  const strippedItem = { ...item };
  delete strippedItem.childTotalPoints;

  const strippedChildren = childrenResponseFields.reduce<Partial<ChatHistoryItemResType>>(
    (acc, field) => {
      const children = item[field] as ChatHistoryItemResType[] | undefined;
      if (!children?.length) return acc;

      return {
        ...acc,
        [field]: children.map(stripChildTotalPoints)
      };
    },
    {}
  );

  return {
    ...strippedItem,
    ...strippedChildren
  };
};

/** 按 `id + parentId` 合并 nodeResponse 增量，旧 `mergeSignId` 语义不再参与合并。 */
export const mergeNodeResponseDataByIdAndParent = (
  responseDataList: ChatHistoryItemResType[] = []
): ChatHistoryItemResType[] =>
  mergeNodeResponseListByParent(responseDataList).map(stripChildTotalPoints);
