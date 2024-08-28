import { DispatchNodeResponseType } from '../workflow/runtime/type';
import { FlowNodeTypeEnum } from '../workflow/node/constant';
import { ChatItemValueTypeEnum, ChatRoleEnum, ChatSourceEnum } from './constants';
import { ChatHistoryItemResType, ChatItemType, UserChatItemValueItemType } from './type.d';
import { sliceStrStartEnd } from '../../common/string/tools';
import { PublishChannelEnum } from '../../support/outLink/constant';

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
  size = 100
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
              if (item.file?.type === 'image') return 'Input an image';
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

export const filterPublicNodeResponseData = ({
  flowResponses = []
}: {
  flowResponses?: ChatHistoryItemResType[];
}) => {
  const filedList = ['quoteList', 'moduleType', 'pluginOutput'];
  const filterModuleTypeList: any[] = [
    FlowNodeTypeEnum.pluginModule,
    FlowNodeTypeEnum.datasetSearchNode,
    FlowNodeTypeEnum.tools,
    FlowNodeTypeEnum.pluginOutput
  ];

  return flowResponses
    .filter((item) => filterModuleTypeList.includes(item.moduleType))
    .map((item) => {
      const obj: DispatchNodeResponseType = {};
      for (let key in item) {
        if (key === 'toolDetail' || key === 'pluginDetail') {
          // @ts-ignore
          obj[key] = filterPublicNodeResponseData({ flowResponses: item[key] });
        } else if (filedList.includes(key)) {
          // @ts-ignore
          obj[key] = item[key];
        }
      }
      return obj as ChatHistoryItemResType;
    });
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
