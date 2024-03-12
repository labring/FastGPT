import { ChatItemValueTypeEnum, ChatRoleEnum } from './constants';
import { ChatItemType } from './type.d';

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
