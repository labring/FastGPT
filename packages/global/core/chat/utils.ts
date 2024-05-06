import { DispatchNodeResponseType } from '../workflow/runtime/type';
import { FlowNodeTypeEnum } from '../workflow/node/constant';
import { ChatItemValueTypeEnum, ChatRoleEnum } from './constants';
import { ChatHistoryItemResType, ChatItemType, UserChatItemValueItemType } from './type.d';

export const getChatTitleFromChatMessage = (message?: ChatItemType, defaultValue = '新对话') => {
  // @ts-ignore
  const textMsg = message?.value.find((item) => item.type === ChatItemValueTypeEnum.text);

  if (textMsg?.text?.content) {
    return textMsg.text.content.slice(0, 20);
  }

  return defaultValue;
};

export const getHistoryPreview = (
  completeMessages: ChatItemType[]
): {
  obj: `${ChatRoleEnum}`;
  value: string;
}[] => {
  return completeMessages.map((item, i) => {
    if (item.obj === ChatRoleEnum.System || i >= completeMessages.length - 2) {
      return {
        obj: item.obj,
        value: item.value?.[0]?.text?.content || ''
      };
    }

    const content = item.value
      .map((item) => {
        if (item.text?.content) {
          const content =
            item.text.content.length > 20
              ? `${item.text.content.slice(0, 20)}...`
              : item.text.content;
          return content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');

    return {
      obj: item.obj,
      value: content
    };
  });
};

export const filterPublicNodeResponseData = ({
  flowResponses = []
}: {
  flowResponses?: ChatHistoryItemResType[];
}) => {
  const filedList = ['quoteList', 'moduleType'];
  const filterModuleTypeList: any[] = [
    FlowNodeTypeEnum.pluginModule,
    FlowNodeTypeEnum.datasetSearchNode,
    FlowNodeTypeEnum.tools
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

export const removeEmptyUserInput = (input: UserChatItemValueItemType[]) => {
  return input.filter((item) => {
    if (item.type === ChatItemValueTypeEnum.text && !item.text?.content?.trim()) {
      return false;
    }
    if (item.type === ChatItemValueTypeEnum.file && !item.file?.url) {
      return false;
    }
    return true;
  });
};
