import { type DispatchNodeResponseType } from '../workflow/runtime/type';
import { FlowNodeTypeEnum } from '../workflow/node/constant';
import { ChatItemValueTypeEnum, ChatRoleEnum, ChatSourceEnum } from './constants';
import {
  type AIChatItemValueItemType,
  type ChatHistoryItemResType,
  type ChatItemType,
  type UserChatItemValueItemType
} from './type.d';
import { sliceStrStartEnd } from '../../common/string/tools';
import { PublishChannelEnum } from '../../support/outLink/constant';
import { removeDatasetCiteText } from '../ai/llm/utils';

// Concat 2 -> 1, and sort by role
export const concatHistories = (histories1: ChatItemType[], histories2: ChatItemType[]) => {
  const newHistories = [...histories1, ...histories2];
  return newHistories.sort((a, b) => {
    if (a.obj === ChatRoleEnum.System) {
      return -1;
    }
    return 1;
  });
};

export const getChatTitleFromChatMessage = (message?: ChatItemType, defaultValue = '新对话') => {
  // @ts-ignore
  const textMsg = message?.value.find((item) => item.type === ChatItemValueTypeEnum.text);

  if (textMsg?.text?.content) {
    return textMsg.text.content.slice(0, 20);
  }

  return defaultValue;
};

// Keep the first n and last n characters
export const getHistoryPreview = (
  completeMessages: ChatItemType[],
  size = 100,
  useVision = false
): {
  obj: `${ChatRoleEnum}`;
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
            .filter(Boolean)
            .join('\n') || ''
        );
      } else if (item.obj === ChatRoleEnum.AI) {
        return (
          item.value
            ?.map((item) => {
              return (
                item.text?.content || item?.tools?.map((item) => item.toolName).join(',') || ''
              );
            })
            .join('') || ''
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

    [FlowNodeTypeEnum.runApp]: true
  };

  const filedMap: Record<string, boolean> = responseDetail
    ? {
        quoteList: true,
        moduleType: true,
        pluginOutput: true,
        runningTime: true
      }
    : {
        moduleType: true,
        pluginOutput: true,
        runningTime: true
      };

  return nodeRespones
    .filter((item) => publicNodeMap[item.moduleType])
    .map((item) => {
      const obj: DispatchNodeResponseType = {};
      for (let key in item) {
        if (key === 'toolDetail' || key === 'pluginDetail') {
          // @ts-ignore
          obj[key] = filterPublicNodeResponseData({ nodeRespones: item[key], responseDetail });
        } else if (filedMap[key]) {
          // @ts-ignore
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

  return value.map<AIChatItemValueItemType>((item) => {
    if (item.text?.content) {
      return {
        ...item,
        text: {
          ...item.text,
          content: removeDatasetCiteText(item.text.content, false)
        }
      };
    }
    if (item.reasoning?.content) {
      return {
        ...item,
        reasoning: {
          ...item.reasoning,
          content: removeDatasetCiteText(item.reasoning.content, false)
        }
      };
    }
    return item;
  }) as T;
};

export const removeEmptyUserInput = (input?: UserChatItemValueItemType[]) => {
  return (
    input?.filter((item) => {
      if (item.type === ChatItemValueTypeEnum.text && !item.text?.content?.trim()) {
        return false;
      }
      // type 为 'file' 时 key 和 url 不能同时为空
      if (item.type === ChatItemValueTypeEnum.file && !item.file?.key && !item.file?.url) {
        return false;
      }
      return true;
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
    case PublishChannelEnum.officialAccount:
      return ChatSourceEnum.official_account;
    default:
      return ChatSourceEnum.online;
  }
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
