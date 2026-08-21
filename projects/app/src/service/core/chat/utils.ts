import type { DatasetCiteItemType } from '@fastgpt/global/core/dataset/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

/* ===== 兼容性代码 ===== */
export enum ChatItemValueTypeEnum {
  text = 'text',
  file = 'file',
  tool = 'tool',
  interactive = 'interactive',
  reasoning = 'reasoning'
}
type ChatItemValueTypeInput = {
  text?: unknown;
  file?: unknown;
  tool?: unknown;
  tools?: unknown;
  interactive?: unknown;
  reasoning?: unknown;
};
/**
 * 根据聊天 value 的实际内容推断旧版兼容 type。
 *
 * text 优先级最高，以兼容同时包含 reasoning 和 text 的 AI 回复；未知或空对象回退为 text。
 */
export const getChatItemValueType = (item: ChatItemValueTypeInput): ChatItemValueTypeEnum => {
  if (item.text) return ChatItemValueTypeEnum.text;
  if ('file' in item) return ChatItemValueTypeEnum.file;
  if (item.tool || item.tools) return ChatItemValueTypeEnum.tool;
  if (item.interactive) return ChatItemValueTypeEnum.interactive;
  if (item.reasoning) return ChatItemValueTypeEnum.reasoning;
  return ChatItemValueTypeEnum.text;
};
/* ===== 兼容性代码 ===== */

export type PublicCompletionInteractive = Pick<WorkflowInteractiveResponseType, 'type' | 'params'>;

export type CompletionDetailValueItem = Omit<AIChatItemValueItemType, 'interactive'> & {
  type?: ChatItemValueTypeEnum;
  interactive?: PublicCompletionInteractive;
};

export type CompletionResponseContent =
  | {
      reasoning?: string;
      content?: string;
    }
  | CompletionDetailValueItem[];

/**
 * 格式化 completions 非流式响应的 choices[].message.content。
 *
 * 普通单条文本保持 OpenAI 兼容字符串；detail=true 且包含交互、工具、文件或多段 value 时，
 * 返回按字段名区分的 value 数组。v1 可通过 includeLegacyType 补充 type，兼容既有客户端；
 * v2 保持不带 type 的新结构。
 */
export const formatCompletionResponseContent = ({
  responseContent,
  detail,
  includeLegacyType
}: {
  responseContent: AIChatItemValueItemType[];
  detail: boolean;
  includeLegacyType: boolean;
}): CompletionResponseContent => {
  const MAX_COMPLETION_INTERACTIVE_EXTRACT_DEPTH = 20;

  const getChildInteractiveResponse = (
    interactive: WorkflowInteractiveResponseType
  ): WorkflowInteractiveResponseType | undefined => {
    const childrenResponse = (interactive.params as { childrenResponse?: unknown })
      .childrenResponse;
    if (!childrenResponse || typeof childrenResponse !== 'object') return;
    if (!('type' in childrenResponse) || !('params' in childrenResponse)) return;

    return childrenResponse as WorkflowInteractiveResponseType;
  };

  const omitChildrenResponse = (
    params: WorkflowInteractiveResponseType['params']
  ): WorkflowInteractiveResponseType['params'] => {
    const publicParams = { ...(params as Record<string, unknown>) };
    delete publicParams.childrenResponse;

    return publicParams as WorkflowInteractiveResponseType['params'];
  };

  /**
   * workflow 暂停恢复依赖 entryNodeIds、memoryEdges、nodeOutputs 等运行态字段；这些字段会保存到
   * chat history，外部接口只需要返回当前交互的展示配置。children/loop/tool 包装节点会继续向下取
   * 真正面向用户的交互节点，并限制最大深度，避免异常循环结构导致死循环。
   */
  const formatPublicCompletionInteractive = (
    interactive: WorkflowInteractiveResponseType
  ): PublicCompletionInteractive => {
    let current = interactive;
    let depth = 0;
    const visited = new WeakSet<object>();

    while (depth < MAX_COMPLETION_INTERACTIVE_EXTRACT_DEPTH) {
      if (visited.has(current)) break;
      visited.add(current);

      const childrenResponse = getChildInteractiveResponse(current);
      if (!childrenResponse) break;

      current = childrenResponse;
      depth++;
    }

    return {
      type: current.type,
      params: omitChildrenResponse(current.params)
    };
  };

  const formatDetailValueList = (responseContent: AIChatItemValueItemType[]) =>
    responseContent.map((item) => ({
      ...item,
      ...(item.interactive && {
        interactive: formatPublicCompletionInteractive(item.interactive)
      }),
      ...(includeLegacyType && { type: getChatItemValueType(item) })
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
