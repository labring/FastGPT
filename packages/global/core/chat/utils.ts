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
import { childrenResponseFields, getChildrenResponses } from './utils/mergeNode';

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

const publicNodeMap: Record<string, boolean> = {
  [FlowNodeTypeEnum.appModule]: true,
  [FlowNodeTypeEnum.pluginModule]: true,
  [FlowNodeTypeEnum.datasetSearchNode]: true,
  [FlowNodeTypeEnum.agent]: true,
  [FlowNodeTypeEnum.pluginOutput]: true,
  [FlowNodeTypeEnum.runApp]: true,
  [FlowNodeTypeEnum.toolCall]: true,
  [FlowNodeTypeEnum.tool]: true
};

const publicNodeResponseFields: Record<string, boolean> = {
  pluginOutput: true,
  runningTime: true,
  toolId: true
};

const treeNodeResponseFields: Record<string, boolean> = {
  ...publicNodeResponseFields,
  parentId: true,
  moduleNameArgs: true,
  totalPoints: true,
  childResponseCount: true,
  errorText: true
};

const getNodeResponseFieldMap = ({
  responseDetail,
  keepTreeFields
}: {
  responseDetail: boolean;
  keepTreeFields: boolean;
}) => {
  const fields = keepTreeFields ? treeNodeResponseFields : publicNodeResponseFields;

  return responseDetail
    ? {
        quoteList: true,
        ...fields
      }
    : fields;
};

const filterNodeResponseData = ({
  nodeResponses = [],
  responseDetail = false,
  keepTreeFields = false
}: {
  nodeResponses?: ChatHistoryItemResType[];
  responseDetail?: boolean;
  keepTreeFields?: boolean;
}) => {
  const fieldMap = getNodeResponseFieldMap({ responseDetail, keepTreeFields });

  return nodeResponses
    .filter((item) => publicNodeMap[item.moduleType])
    .map((item) => {
      const obj: DispatchNodeResponseType = {};
      for (const key in item) {
        const childField = key as (typeof childrenResponseFields)[number];
        if (childrenResponseFields.includes(childField)) {
          const childResponses = item[childField] as ChatHistoryItemResType[] | undefined;
          obj[childField] = filterNodeResponseData({
            nodeResponses: childResponses,
            responseDetail,
            keepTreeFields
          });
        } else if (fieldMap[key]) {
          // @ts-expect-error Dynamic public field copy is constrained by fieldMap.
          obj[key] = item[key];
        }
      }

      if (keepTreeFields) {
        return {
          id: item.id,
          nodeId: item.nodeId,
          moduleName: item.moduleName,
          moduleType: item.moduleType,
          ...obj
        } as ChatHistoryItemResType;
      }

      return {
        moduleType: item.moduleType,
        ...obj
      } as ChatHistoryItemResType;
    });
};

/**
 * 过滤工作流节点对外可见的响应字段。
 *
 * 公共 API 和分享场景不应直接暴露完整 nodeResponse，只保留旧契约中的展示字段。
 * childrenResponses 与历史 detail 字段会递归过滤，保证新旧数据结构返回口径一致。
 */
export const filterPublicNodeResponseData = ({
  nodeRespones = [],
  responseDetail = false
}: {
  nodeRespones?: ChatHistoryItemResType[];
  responseDetail?: boolean;
}) =>
  filterNodeResponseData({
    nodeResponses: nodeRespones,
    responseDetail
  });

/**
 * 过滤前端树形详情需要的 nodeResponse 字段。
 *
 * 与 public/share 过滤不同，SSE 和 completion response 需要保留 `id/parentId` 等树形归属
 * 字段，否则乱序 child 无法在前端挂回 parent；但仍过滤 toolInput/toolRes 等大字段或敏感字段。
 */
export const filterNodeResponseTreeData = ({
  nodeResponses = [],
  responseDetail = false
}: {
  nodeResponses?: ChatHistoryItemResType[];
  responseDetail?: boolean;
}) =>
  filterNodeResponseData({
    nodeResponses,
    responseDetail,
    keepTreeFields: true
  });

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
