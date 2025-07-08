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
import { removeDatasetCiteText } from '../../../service/core/ai/utils';

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
  flowResponses = [],
  responseDetail = false
}: {
  flowResponses?: ChatHistoryItemResType[];
  responseDetail?: boolean;
}) => {
  const publicNodeMap: Record<string, any> = {
    [FlowNodeTypeEnum.pluginModule]: true,
    [FlowNodeTypeEnum.datasetSearchNode]: true,
    [FlowNodeTypeEnum.agent]: true,
    [FlowNodeTypeEnum.pluginOutput]: true
  };

  const filedList = responseDetail
    ? ['quoteList', 'moduleType', 'pluginOutput', 'runningTime']
    : ['moduleType', 'pluginOutput', 'runningTime'];

  return flowResponses
    .filter((item) => publicNodeMap[item.moduleType])
    .map((item) => {
      const obj: DispatchNodeResponseType = {};
      for (let key in item) {
        if (key === 'toolDetail' || key === 'pluginDetail') {
          // @ts-ignore
          obj[key] = filterPublicNodeResponseData({ flowResponses: item[key], responseDetail });
        } else if (filedList.includes(key)) {
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
      if (item.type === ChatItemValueTypeEnum.file && !item.file?.url) {
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
  // Merge children reponse data(Children has interactive response)
  const responseWithMergedPlugins = responseDataList.map((item) => {
    if (item.pluginDetail && item.pluginDetail.length > 1) {
      return {
        ...item,
        pluginDetail: mergeChatResponseData(item.pluginDetail)
      };
    }
    return item;
  });

  let lastResponse: ChatHistoryItemResType | undefined = undefined;
  let hasMerged = false;

  const firstPassResult = responseWithMergedPlugins.reduce<ChatHistoryItemResType[]>(
    (acc, curr) => {
      if (
        lastResponse &&
        lastResponse.mergeSignId &&
        curr.mergeSignId === lastResponse.mergeSignId
      ) {
        const concatResponse: ChatHistoryItemResType = {
          ...curr,
          runningTime: +((lastResponse.runningTime || 0) + (curr.runningTime || 0)).toFixed(2),
          totalPoints: (lastResponse.totalPoints || 0) + (curr.totalPoints || 0),
          childTotalPoints: (lastResponse.childTotalPoints || 0) + (curr.childTotalPoints || 0),
          toolDetail: [...(lastResponse.toolDetail || []), ...(curr.toolDetail || [])],
          loopDetail: [...(lastResponse.loopDetail || []), ...(curr.loopDetail || [])],
          pluginDetail: [...(lastResponse.pluginDetail || []), ...(curr.pluginDetail || [])]
        };
        hasMerged = true;
        return [...acc.slice(0, -1), concatResponse];
      } else {
        lastResponse = curr;
        return [...acc, curr];
      }
    },
    []
  );

  if (hasMerged && firstPassResult.length > 1) {
    return mergeChatResponseData(firstPassResult);
  }

  return firstPassResult;
};
