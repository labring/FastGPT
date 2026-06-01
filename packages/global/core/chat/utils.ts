import { type DispatchNodeResponseType } from '../workflow/runtime/type';
import { FlowNodeTypeEnum } from '../workflow/node/constant';
import { ChatRoleEnum, ChatSourceEnum } from './constants';
import {
  type AIChatItemValueItemType,
  type ChatHistoryItemResType,
  type ChatItemMiniType,
  type UserChatItemValueItemType
} from './type';
import { sliceStrStartEnd } from '../../common/string/tools';
import { PublishChannelEnum } from '../../support/outLink/constant';
import { removeDatasetCiteText } from '../ai/llm/utils';
import type { WorkflowInteractiveResponseType } from '../workflow/template/system/interactive/type';

const deprecatedChildrenResponseFields = [
  'pluginDetail',
  'toolDetail',
  'loopDetail',
  'loopRunDetail',
  'parallelDetail'
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

const getNodeResponseId = (response: ChatHistoryItemResType) => response.id;

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
  const childrenResponses = [
    ...(current.childrenResponses || []),
    ...(incoming.childrenResponses || [])
  ].reduce<ChatHistoryItemResType[]>((list, child) => appendNodeResponseByParent(list, child), []);

  const mergedLegacyChildren = childrenResponseFields.reduce<Partial<ChatHistoryItemResType>>(
    (acc, field) => {
      if (field === 'childrenResponses') return acc;
      const merged = [
        ...((current[field] || []) as ChatHistoryItemResType[]),
        ...((incoming[field] || []) as ChatHistoryItemResType[])
      ].reduce<ChatHistoryItemResType[]>(
        (list, child) => appendNodeResponseByParent(list, child),
        []
      );

      return merged.length > 0 ? { ...acc, [field]: merged } : acc;
    },
    {}
  );

  return {
    ...current,
    ...incoming,
    ...mergedLegacyChildren,
    ...(childrenResponses.length > 0 ? { childrenResponses } : {})
  };
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
  const incomingId = getNodeResponseId(incoming);
  let merged = false;

  const nextResponses = responses.map((response) => {
    if (incomingId && getNodeResponseId(response) === incomingId) {
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
  const nodeResponseId = getNodeResponseId(nodeResponse);

  // 同一个节点可能被多次推送，先从整棵树中摘出旧版本，再与新版本合并。
  const duplicateResult = nodeResponseId
    ? removeNodeResponses(responses, (response) => getNodeResponseId(response) === nodeResponseId)
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
      if (getNodeResponseId(item) === parentId) {
        inserted = true;
        return {
          ...item,
          childrenResponses: mergeNodeResponseList(
            item.childrenResponses || [],
            incomingWithChildren
          )
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

// Concat 2 -> 1, and sort by role
export const concatHistories = (histories1: ChatItemMiniType[], histories2: ChatItemMiniType[]) => {
  const newHistories = [...histories1, ...histories2];
  return newHistories.sort((a) => {
    if (a.obj === ChatRoleEnum.System) {
      return -1;
    }
    return 1;
  });
};

export const hasContextCheckpoint = (history: ChatItemMiniType) =>
  history.obj === ChatRoleEnum.AI &&
  history.value.some((value) => Boolean(value.contextCheckpoint));

export const getChatTitleFromChatMessage = (
  message?: ChatItemMiniType,
  defaultValue = '新对话'
) => {
  const textMsg = message?.value.find((item) => 'text' in item && item.text);

  if (textMsg?.text?.content) {
    return textMsg.text.content.slice(0, 20);
  }

  return defaultValue;
};

// Keep the first n and last n characters
export const getHistoryPreview = (
  completeMessages: ChatItemMiniType[],
  size = 100,
  useVision = false
): {
  obj: ChatRoleEnum;
  value: string;
}[] => {
  return completeMessages.map((item, i) => {
    const n =
      (item.obj === ChatRoleEnum.System && i === 0) || i >= completeMessages.length - 2 ? size : 50;

    // Get message text content
    const rawText = (() => {
      if (item.obj === ChatRoleEnum.System) {
        return item.value?.map((item) => item.text?.content).join('') || '';
      } else if (item.obj === ChatRoleEnum.Human) {
        return (
          item.value
            ?.map((item) => {
              if (item?.text?.content) return item?.text?.content;
              if (item.file?.type === 'image' && useVision)
                return `![Input an image](${item.file.url.slice(0, 100)}...)`;
              return '';
            })
            .join('\n') || ''
        );
      } else if (item.obj === ChatRoleEnum.AI) {
        return (
          item.value
            ?.map((item) => {
              return (
                item.text?.content ||
                item.tool?.toolName ||
                item?.tools?.map((item) => item.toolName).join(',') ||
                ''
              );
            })
            .join('')
            .trim() || ''
        );
      }
      return '';
    })();

    return {
      obj: item.obj,
      value: sliceStrStartEnd(rawText, n, n)
    };
  });
};

/**
 * 过滤工作流节点对外可见的响应字段。
 *
 * 公共 API 和分享场景不应直接暴露完整 nodeResponse，只保留可展示、可计费统计的字段。
 * childrenResponses 与历史 detail 字段会递归过滤，保证新旧数据结构返回口径一致。
 */
export const filterPublicNodeResponseData = ({
  nodeRespones = [],
  responseDetail = false
}: {
  nodeRespones?: ChatHistoryItemResType[];
  responseDetail?: boolean;
}) => {
  const publicNodeMap: Record<string, any> = {
    [FlowNodeTypeEnum.appModule]: true,
    [FlowNodeTypeEnum.pluginModule]: true,
    [FlowNodeTypeEnum.datasetSearchNode]: true,
    [FlowNodeTypeEnum.agent]: true,
    [FlowNodeTypeEnum.pluginOutput]: true,
    [FlowNodeTypeEnum.runApp]: true,
    [FlowNodeTypeEnum.toolCall]: true,
    [FlowNodeTypeEnum.tool]: true
  };

  const commonFields = {
    parentId: true,
    moduleNameArgs: true,
    pluginOutput: true,
    runningTime: true,
    toolId: true,
    totalPoints: true,
    childTotalPoints: true,
    childResponseCount: true,
    errorText: true
  };
  const filedMap: Record<string, boolean> = responseDetail
    ? {
        quoteList: true,
        ...commonFields
      }
    : commonFields;

  return nodeRespones
    .filter((item) => publicNodeMap[item.moduleType])
    .map((item) => {
      const obj: DispatchNodeResponseType = {};
      for (const key in item) {
        const childField = key as (typeof childrenResponseFields)[number];
        if (childrenResponseFields.includes(childField)) {
          const childResponses = item[childField] as ChatHistoryItemResType[] | undefined;
          obj[childField] = filterPublicNodeResponseData({
            nodeRespones: childResponses,
            responseDetail
          });
        } else if (filedMap[key]) {
          // @ts-expect-error Dynamic public field copy is constrained by filedMap.
          obj[key] = item[key];
        }
      }
      return {
        id: item.id,
        nodeId: item.nodeId,
        moduleName: item.moduleName,
        moduleType: item.moduleType,
        ...obj
      } as ChatHistoryItemResType;
    });
};

// Remove dataset cite in ai response
export const removeAIResponseCite = <T extends AIChatItemValueItemType[] | string>(
  value: T,
  retainCite: boolean
): T => {
  if (retainCite) return value;

  if (typeof value === 'string') {
    return removeDatasetCiteText(value, false) as T;
  }

  return value.map<AIChatItemValueItemType>((item) => ({
    ...item,
    ...(item.text?.content
      ? {
          text: {
            ...item.text,
            content: removeDatasetCiteText(item.text.content, false)
          }
        }
      : {}),
    ...(item.reasoning?.content
      ? {
          reasoning: {
            ...item.reasoning,
            content: removeDatasetCiteText(item.reasoning.content, false)
          }
        }
      : {})
  })) as T;
};

export const removeEmptyUserInput = (input?: UserChatItemValueItemType[]) => {
  return (
    input?.filter((item) => {
      // 有文本内容，保留
      if (item.text?.content?.trim()) {
        return true;
      }
      // 有文件且文件有 key 或 url，保留
      if (item.file && (item.file.key || item.file.url)) {
        return true;
      }
      // 其他情况过滤掉
      return false;
    }) || []
  );
};

export const getPluginOutputsFromChatResponses = (responses: ChatHistoryItemResType[]) => {
  const outputs =
    responses.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput)?.pluginOutput ?? {};
  return outputs;
};

export const getChatSourceByPublishChannel = (publishChannel: PublishChannelEnum) => {
  switch (publishChannel) {
    case PublishChannelEnum.share:
      return ChatSourceEnum.share;
    case PublishChannelEnum.iframe:
      return ChatSourceEnum.share;
    case PublishChannelEnum.apikey:
      return ChatSourceEnum.api;
    case PublishChannelEnum.feishu:
      return ChatSourceEnum.feishu;
    case PublishChannelEnum.wecom:
      return ChatSourceEnum.wecom;
    case PublishChannelEnum.wechat:
      return ChatSourceEnum.wechat;
    case PublishChannelEnum.officialAccount:
      return ChatSourceEnum.official_account;
    default:
      return ChatSourceEnum.online;
  }
};

/**
 * 扁平化节点响应树。
 *
 * 新数据使用 childrenResponses，历史数据可能仍在 pluginDetail/toolDetail 等字段中；
 * 统一通过 getChildrenResponses 递归展开，供统计、标签计算和详情搜索复用。
 */
export const getFlatAppResponses = (res: ChatHistoryItemResType[]): ChatHistoryItemResType[] => {
  return res
    .map((item) => {
      return [item, ...getFlatAppResponses(getChildrenResponses(item))];
    })
    .flat();
};

/* 
  对于交互模式下，有两种响应：
  1. 提交交互结果，此时不会新增一条 user 消息
  2. 发送 user 消息，此时对话会新增一条 user 消息
*/
export const checkInteractiveResponseStatus = ({
  interactive
}: {
  interactive: { type: WorkflowInteractiveResponseType['type'] };
  input: string;
}): 'submit' | 'query' => {
  if (interactive.type === 'agentPlanAskQuery') {
    return 'query';
  }
  return 'submit';
};

/**
 * 按 mergeSignId 合并 chat responseData。
 *
 * 交互式工具节点在多轮 append 时会产生相同 mergeSignId 的响应，需要把运行时间、
 * 积分和 child 统计累加，同时递归合并 childrenResponses。历史 detail 字段只用于
 * 兼容旧数据和旧 append 逻辑，新数据不再往这些字段写入 child 节点。
 */
export const mergeChatResponseData = (
  responseDataList: ChatHistoryItemResType[]
): ChatHistoryItemResType[] => {
  const result: ChatHistoryItemResType[] = [];
  const mergeMap = new Map<string, number>(); // mergeSignId -> result index

  for (const item of responseDataList) {
    if (item.mergeSignId && mergeMap.has(item.mergeSignId)) {
      // Merge with existing item
      const existingIndex = mergeMap.get(item.mergeSignId)!;
      const existing = result[existingIndex];

      result[existingIndex] = {
        ...item,
        runningTime: +((existing.runningTime || 0) + (item.runningTime || 0)).toFixed(2),
        totalPoints: (existing.totalPoints || 0) + (item.totalPoints || 0),
        childTotalPoints: (existing.childTotalPoints || 0) + (item.childTotalPoints || 0),
        childResponseCount:
          (existing.childResponseCount || 0) + (item.childResponseCount || 0) || undefined,
        childrenResponses: mergeChatResponseData([
          ...(existing.childrenResponses || []),
          ...(item.childrenResponses || [])
        ]),
        // 以下 detail 字段已弃用；仅用于兼容历史数据读取和旧会话 append 合并。
        toolDetail: mergeChatResponseData([
          ...(existing.toolDetail || []),
          ...(item.toolDetail || [])
        ]),
        loopDetail: mergeChatResponseData([
          ...(existing.loopDetail || []),
          ...(item.loopDetail || [])
        ]),
        loopRunDetail: mergeChatResponseData([
          ...(existing.loopRunDetail || []),
          ...(item.loopRunDetail || [])
        ]),
        parallelDetail: mergeChatResponseData([
          ...(existing.parallelDetail || []),
          ...(item.parallelDetail || [])
        ]),
        pluginDetail: mergeChatResponseData([
          ...(existing.pluginDetail || []),
          ...(item.pluginDetail || [])
        ])
      };
    } else {
      // Add new item
      result.push(item);
      if (item.mergeSignId) {
        mergeMap.set(item.mergeSignId, result.length - 1);
      }
    }
  }

  return result;
};
