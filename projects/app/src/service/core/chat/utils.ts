import type { DatasetCiteItemType } from '@fastgpt/global/core/dataset/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { pick } from 'lodash-es';

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

const publicCompletionValueKeys = [
  'id',
  'text',
  'reasoning',
  'tool',
  'tools',
  'skills',
  'plan',
  'planStatus',
  'agentPlanUpdate',
  'workflowBuilderVersion',
  'chatAgentBuilderVersion',
  'hideReason'
] as const satisfies (keyof AIChatItemValueItemType)[];

export type CompletionDetailValueItem = Pick<
  AIChatItemValueItemType,
  (typeof publicCompletionValueKeys)[number]
> & {
  type?: ChatItemValueTypeEnum;
  interactive?: PublicCompletionInteractive;
  file?: unknown;
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
      // 未能解开的运行态包装（损坏、循环或超深）不能暴露 toolParams、loopHistory 等内部上下文。
      params:
        current.type === 'childrenInteractive' ||
        current.type === 'toolChildrenInteractive' ||
        current.type === 'loopInteractive' ||
        current.type === 'loopRunInteractive'
          ? ({} as WorkflowInteractiveResponseType['params'])
          : current.params
    };
  };

  /** 只投影公开展示字段；新增恢复元数据默认不出现在非流式 API 响应中。 */
  const publicValues = responseContent.flatMap((item): CompletionDetailValueItem[] => {
    if (item.hideInUI) return [];
    const value: CompletionDetailValueItem = pick(item, publicCompletionValueKeys);
    const formatPublicTool = (tool: NonNullable<AIChatItemValueItemType['tool']>) => {
      const publicTool = pick(tool, [
        'id',
        'toolName',
        'toolAvatar',
        'params',
        'response',
        'hideDetails',
        'functionName'
      ]);
      return tool.internalOnly
        ? { ...publicTool, params: '', response: '', hideDetails: true }
        : publicTool;
    };
    if (item.tools) value.tools = item.tools.filter((tool) => !tool.hideInUI).map(formatPublicTool);
    if (item.tool) value.tool = item.tool.hideInUI ? undefined : formatPublicTool(item.tool);
    if (item.interactive) value.interactive = formatPublicCompletionInteractive(item.interactive);
    // 兼容旧版文件 value；当前 AI Schema 不再声明该字段。
    if ('file' in item) value.file = item.file;

    const hasPublicContent =
      value.text ||
      value.reasoning ||
      value.tool ||
      value.tools?.length ||
      value.skills?.length ||
      value.interactive ||
      'file' in value ||
      value.plan !== undefined ||
      value.planStatus !== undefined ||
      value.agentPlanUpdate ||
      value.workflowBuilderVersion ||
      value.chatAgentBuilderVersion;
    return hasPublicContent ? [value] : [];
  });

  const formatDetailValueList = () =>
    publicValues.map((item) => ({
      ...item,
      ...(includeLegacyType && { type: getChatItemValueType(item) })
    }));

  const shouldReturnDetailValueList = ({
    responseContent,
    detail
  }: {
    responseContent: CompletionDetailValueItem[];
    detail: boolean;
  }) => {
    if (!detail) return false;
    if (responseContent.length > 1) return true;

    const [item] = responseContent;
    if (!item) return false;

    return !!(item.interactive || item.tool || item.tools || 'file' in item);
  };

  if (publicValues.length === 0) {
    return {
      reasoning: '',
      content: ''
    };
  }

  if (shouldReturnDetailValueList({ responseContent: publicValues, detail })) {
    return formatDetailValueList();
  }

  if (publicValues.length === 1) {
    return {
      reasoning: publicValues[0].reasoning?.content,
      content: publicValues[0].text?.content
    };
  }

  return {
    reasoning: publicValues
      .map((item) => item?.reasoning?.content)
      .filter(Boolean)
      .join('\n'),
    content: publicValues
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
