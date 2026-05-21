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

// Filter workflow public response
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
    moduleType: true,
    pluginOutput: true,
    runningTime: true,
    toolId: true
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
        if (key === 'toolDetail' || key === 'pluginDetail') {
          obj[key] = filterPublicNodeResponseData({ nodeRespones: item[key], responseDetail });
        } else if (filedMap[key]) {
          // @ts-expect-error Dynamic public field copy is constrained by filedMap.
          obj[key] = item[key];
        }
      }
      return obj as ChatHistoryItemResType;
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

// 扁平化响应
export const getFlatAppResponses = (res: ChatHistoryItemResType[]): ChatHistoryItemResType[] => {
  return res
    .map((item) => {
      return [
        item,
        ...getFlatAppResponses(item.pluginDetail || []),
        ...getFlatAppResponses(item.toolDetail || []),
        ...getFlatAppResponses(item.loopDetail || []),
        ...getFlatAppResponses(item.loopRunDetail || []),
        ...getFlatAppResponses(item.parallelDetail || []),
        ...getFlatAppResponses(item.childrenResponses || [])
      ];
    })
    .flat();
};

/* 
  对于交互模式下，有两种响应：
  1. 提交交互结果，此时不会新增一条 user 消息
  2. 发送 user 消息，此时对话会新增一条 user 消息
*/
export const checkInteractiveResponseStatus = ({
  interactive,
  input
}: {
  interactive: { type: WorkflowInteractiveResponseType['type'] };
  input: string;
}): 'submit' | 'query' => {
  if (interactive.type === 'agentPlanAskQuery') {
    return 'query';
  }
  return 'submit';
};

/*
  Merge chat responseData
  1. Same tool mergeSignId (Interactive tool node)
  2. Recursively merge plugin details with same mergeSignId
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
