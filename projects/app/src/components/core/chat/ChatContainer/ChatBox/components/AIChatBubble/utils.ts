import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';

export const hasAiAnswerContent = (item: AIChatItemValueItemType) =>
  Boolean(item.text?.content?.trim());

export const hasAiInteractiveContent = (item: AIChatItemValueItemType) => Boolean(item.interactive);

export const hasAiProcessingContent = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return false;

  const tools = item.tools || (item.tool ? [item.tool] : undefined);
  return Boolean(
    (item.reasoning?.content && !item.hideReason) ||
    tools?.length ||
    item.skills?.length ||
    item.plan ||
    item.planStatus?.status === 'generating'
  );
};

export const hasAiFoldableProcessingContent = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return false;

  const tools = item.tools || (item.tool ? [item.tool] : undefined);
  return Boolean((item.reasoning?.content && !item.hideReason) || tools?.length);
};

export const hasAiStandaloneProcessingContent = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return false;

  return Boolean(item.skills?.length || item.plan || item.planStatus?.status === 'generating');
};

/**
 * 获取 Workflow Builder 一次响应中可独立展示的最终正文。
 *
 * 生成期间所有文本都属于过程；完成后只有位于最后一次交互之后的最后一段正文才是最终输出。
 * 这样恢复 Ask/方案确认后追加的收尾正文可以正常显示，暂停中的交互则不会误露中间文本。
 */
export const getWorkflowBuilderFinalAnswerIndex = ({
  chatValue,
  isGenerating
}: {
  chatValue: AIChatItemValueItemType[];
  isGenerating: boolean;
}) => {
  if (isGenerating) return -1;

  let lastAnswerIndex = -1;
  let lastInteractiveIndex = -1;
  chatValue.forEach((value, index) => {
    if (value.hideInUI) return;
    if (hasAiAnswerContent(value)) lastAnswerIndex = index;
    if (hasAiInteractiveContent(value)) lastInteractiveIndex = index;
  });

  return lastAnswerIndex > lastInteractiveIndex ? lastAnswerIndex : -1;
};

export type WorkflowBuilderDisplayBlock =
  | {
      type: 'process';
      valueIndices: number[];
      answerValueIndices: number[];
      startIndex: number;
      isProcessing: boolean;
    }
  | {
      type: 'interactive' | 'finalAnswer' | 'version';
      valueIndex: number;
    };

/**
 * 按交互边界切分 Workflow Builder 的一次 AI 响应，并保持 chatValue 的时间顺序。
 *
 * Mermaid 确认等 submit 交互会继续写入同一个 AI ChatItem。交互前后的过程必须拆成
 * 两个展示段，否则确认后的 reasoning/tool 会被提升到交互卡片上方。已提交交互刚恢复、
 * 但尚未收到首个内容事件时，追加一个空的活动处理段，让 UI 立即展示“处理中”。
 */
export const getWorkflowBuilderDisplayBlocks = ({
  chatValue,
  isGenerating
}: {
  chatValue: AIChatItemValueItemType[];
  isGenerating: boolean;
}): WorkflowBuilderDisplayBlock[] => {
  const finalAnswerIndex = getWorkflowBuilderFinalAnswerIndex({ chatValue, isGenerating });
  const blocks: WorkflowBuilderDisplayBlock[] = [];
  let processValueIndices: number[] = [];

  const flushProcessBlock = () => {
    if (processValueIndices.length === 0) return;

    blocks.push({
      type: 'process',
      valueIndices: processValueIndices,
      answerValueIndices: processValueIndices.filter(
        (index) => index !== finalAnswerIndex && hasAiAnswerContent(chatValue[index])
      ),
      startIndex: processValueIndices[0],
      isProcessing: false
    });
    processValueIndices = [];
  };

  chatValue.forEach((value, index) => {
    if (value.hideInUI) return;

    const isFinalAnswer = index === finalAnswerIndex;
    const hasProcessOutput =
      hasAiProcessingContent(value) || (!isFinalAnswer && hasAiAnswerContent(value));

    if (hasProcessOutput) processValueIndices.push(index);

    if (isFinalAnswer) {
      flushProcessBlock();
      blocks.push({ type: 'finalAnswer', valueIndex: index });
    }

    if (hasAiInteractiveContent(value)) {
      flushProcessBlock();
      blocks.push({ type: 'interactive', valueIndex: index });
    }

    if (value.workflowBuilderVersion) {
      flushProcessBlock();
      blocks.push({ type: 'version', valueIndex: index });
    }
  });

  flushProcessBlock();

  const lastBlock = blocks[blocks.length - 1];
  const shouldAppendActiveProcess = (() => {
    if (!isGenerating || lastBlock?.type !== 'interactive') return false;

    const interactive = chatValue[lastBlock.valueIndex]?.interactive;
    if (!interactive) return false;

    const finalInteractive = extractDeepestInteractive(interactive);
    if (finalInteractive.type === 'workflowBuilderPreview') {
      return finalInteractive.params.answerValue !== undefined;
    }
    if (finalInteractive.type === 'agentAsk') {
      return finalInteractive.params.submitted === true;
    }
    if (finalInteractive.type === 'agentPlanAskQuery') {
      return finalInteractive.params.answer !== undefined;
    }
    if (finalInteractive.type === 'userSelect') {
      return finalInteractive.params.userSelectedVal !== undefined;
    }
    if (finalInteractive.type === 'userInput') {
      return finalInteractive.params.submitted === true;
    }
    if (finalInteractive.type === 'paymentPause') {
      return finalInteractive.params.continue === true;
    }

    return false;
  })();

  if (shouldAppendActiveProcess) {
    blocks.push({
      type: 'process',
      valueIndices: [],
      answerValueIndices: [],
      startIndex: chatValue.length,
      isProcessing: true
    });
    return blocks;
  }

  if (isGenerating && blocks[blocks.length - 1]?.type === 'process') {
    const finalProcessBlock = blocks[blocks.length - 1];
    if (finalProcessBlock.type === 'process') finalProcessBlock.isProcessing = true;
  }

  return blocks;
};

/**
 * 将一个 AI ChatItem 的 value 分成气泡渲染组。
 *
 * 普通聊天沿用正文/交互分组；Workflow Builder 必须保留整次响应，才能在下一层把所有
 * 中间轮次包进同一个最外层处理折叠。返回值始终至少包含一个组，以延续空响应占位行为。
 */
export const groupAIChatResponseValues = ({
  chatValue,
  isLastChild,
  isChatting,
  collapseIntermediateAgentResponses
}: {
  chatValue: AIChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
  collapseIntermediateAgentResponses: boolean;
}) => {
  const filterList = chatValue.filter((item) => !shouldFilterAiValue(item));
  if (collapseIntermediateAgentResponses) {
    return filterList.length > 0 ? [filterList] : [[{ text: { content: '' } }]];
  }

  const groupedValues: AIChatItemValueItemType[][] = [];
  let currentGroup: AIChatItemValueItemType[] = [];
  filterList.forEach((value) => {
    if (value.interactive) {
      if (currentGroup.length > 0) {
        groupedValues.push(currentGroup);
        currentGroup = [];
      }

      groupedValues.push([value]);
      return;
    }

    currentGroup.push(value);
    if (hasAiAnswerContent(value)) {
      groupedValues.push(currentGroup);
      currentGroup = [];
    }
  });

  if (currentGroup.length > 0) groupedValues.push(currentGroup);

  const lastGroup = groupedValues[groupedValues.length - 1];
  if (isLastChild && (isChatting || groupedValues.length === 0)) {
    if (lastGroup?.[lastGroup.length - 1]?.interactive || groupedValues.length === 0) {
      groupedValues.push([{ text: { content: '' } }]);
    }
  } else if (groupedValues.length === 0) {
    groupedValues.push([{ text: { content: '' } }]);
  }

  return groupedValues;
};

export const shouldFilterAiValue = (item: AIChatItemValueItemType) => {
  if (item.hideInUI) return true;
  if (item.text?.content?.trim() || item.reasoning?.content?.trim()) return false;
  if (!item.text && !item.reasoning) return false;

  return !(
    item.tools?.length ||
    item.tool ||
    item.skills?.length ||
    item.interactive ||
    item.plan ||
    item.planStatus ||
    item.agentPlanUpdate ||
    item.agentAsk ||
    item.contextCheckpoint ||
    item.workflowBuilderVersion
  );
};

/**
 * 判断 AI 气泡是否需要展示“应用无输出内容”兜底提示。
 *
 * `isChatting` 是 ChatBox 级别的全局状态，历史消息在下一轮生成时也会收到 true。
 * 因此只能在当前气泡自身是最后一条且正在生成时隐藏提示，避免历史空输出提示被后续发送误隐藏。
 */
export const shouldShowNoOutputTip = ({
  obj,
  status,
  isLastValueGroup,
  isLastChild,
  isChatting,
  shouldWaitCurrentChatStatus,
  hasError,
  hasValidContent
}: {
  obj: `${ChatRoleEnum}`;
  status: `${ChatStatusEnum}`;
  isLastValueGroup: boolean;
  isLastChild: boolean;
  isChatting: boolean;
  shouldWaitCurrentChatStatus: boolean;
  hasError: boolean;
  hasValidContent: boolean;
}) =>
  obj === ChatRoleEnum.AI &&
  status === ChatStatusEnum.finish &&
  isLastValueGroup &&
  !(isLastChild && isChatting) &&
  !shouldWaitCurrentChatStatus &&
  !hasError &&
  !hasValidContent;
