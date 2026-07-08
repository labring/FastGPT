import type { DatasetCiteItemType } from '@fastgpt/global/core/dataset/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

export enum ChatItemValueTypeEnum {
  text = 'text',
  file = 'file',
  tool = 'tool',
  interactive = 'interactive',
  reasoning = 'reasoning'
}

export type CompletionDetailValueItem = AIChatItemValueItemType & {
  type: ChatItemValueTypeEnum;
};

export type CompletionResponseContent =
  | {
      reasoning?: string;
      content?: string;
    }
  | CompletionDetailValueItem[];

const getChatItemValueType = (item: AIChatItemValueItemType): ChatItemValueTypeEnum => {
  if (item.text) return ChatItemValueTypeEnum.text;
  if ('file' in item) return ChatItemValueTypeEnum.file;
  if (item.tool || item.tools) return ChatItemValueTypeEnum.tool;
  if (item.interactive) return ChatItemValueTypeEnum.interactive;
  if (item.reasoning) return ChatItemValueTypeEnum.reasoning;
  return ChatItemValueTypeEnum.text;
};

const formatDetailValueList = (responseContent: AIChatItemValueItemType[]) =>
  responseContent.map((item) => ({
    ...item,
    type: getChatItemValueType(item)
  }));

const shouldReturnDetailValueList = ({
  responseContent,
  detail
}: {
  responseContent: AIChatItemValueItemType[];
  detail: boolean;
}) => {
  if (!detail) return false;
  if (responseContent.length > 1) return true;

  const [item] = responseContent;
  if (!item) return false;

  return !!(item.interactive || item.tool || item.tools || 'file' in item);
};

/**
 * 格式化 completions 非流式响应的 choices[].message.content。
 *
 * 普通单条文本保持 OpenAI 兼容字符串；detail=true 且包含交互、工具、文件或多段 value 时，
 * 返回带 type 的数组，确保交互节点可从 choices 中被客户端识别。
 */
export const formatCompletionResponseContent = ({
  responseContent,
  detail
}: {
  responseContent: AIChatItemValueItemType[];
  detail: boolean;
}): CompletionResponseContent => {
  if (responseContent.length === 0) {
    return {
      reasoning: '',
      content: ''
    };
  }

  if (shouldReturnDetailValueList({ responseContent, detail })) {
    return formatDetailValueList(responseContent);
  }

  if (responseContent.length === 1) {
    return {
      reasoning: responseContent[0].reasoning?.content,
      content: responseContent[0].text?.content
    };
  }

  return {
    reasoning: responseContent
      .map((item) => item?.reasoning?.content)
      .filter(Boolean)
      .join('\n'),
    content: responseContent
      .map((item) => item?.text?.content)
      .filter(Boolean)
      .join('\n')
  };
};

// 获取对话时间时，引用的内容
export function processChatTimeFilter(
  dataList: DatasetCiteItemType[],
  chatTime: Date
): DatasetCiteItemType[] {
  return dataList.map((item) => {
    const defaultItem = item;

    if (!item.history) return defaultItem;

    const history = item.history;
    const formatedChatTime = new Date(chatTime);

    if (item.updateTime <= formatedChatTime) {
      return defaultItem;
    }

    const latestHistoryIndex = history.findIndex(
      (historyItem) => historyItem.updateTime <= formatedChatTime
    );

    if (latestHistoryIndex === -1) {
      return defaultItem;
    }

    const latestHistory = history[latestHistoryIndex];

    return {
      ...item,
      q: latestHistory.q,
      a: latestHistory.a,
      updateTime: latestHistory.updateTime,
      updated: true
    };
  });
}
