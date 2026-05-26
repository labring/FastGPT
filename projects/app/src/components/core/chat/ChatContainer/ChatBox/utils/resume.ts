import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { mergeChatResponseData } from '@fastgpt/global/core/chat/utils';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { ChatSiteItemType } from '../type';

/**
 * 判断恢复流中是否需要先补一个 AI placeholder。
 *
 * 恢复生成时，前端可能先拿到 SSE 增量事件，而历史记录中还没有本轮 AI 消息。
 * 对于会产生可见回答内容、运行状态或响应详情的事件，需要先创建一个稳定的
 * AI placeholder，后续 `generatingMessage` 才能继续沿用“更新最后一条 AI 消息”
 * 的约束。
 *
 * 不在这里处理 error/updateVariables 等控制类事件：
 * - error 只影响最终状态和 toast，不应该制造空 AI 气泡。
 * - updateVariables 会回写变量，不代表有可展示的 AI 输出。
 *
 * 该函数必须和 `generatingMessage` 支持的可见 SSE 事件保持同步。
 */
export const shouldCreateResumeAiPlaceholder = (event: SseResponseEventEnum) => {
  return [
    SseResponseEventEnum.flowNodeResponse,
    SseResponseEventEnum.flowNodeStatus,
    SseResponseEventEnum.answer,
    SseResponseEventEnum.fastAnswer,
    SseResponseEventEnum.toolCall,
    SseResponseEventEnum.toolParams,
    SseResponseEventEnum.toolResponse,
    SseResponseEventEnum.interactive,
    SseResponseEventEnum.plan,
    SseResponseEventEnum.planStatus,
    SseResponseEventEnum.workflowDuration
  ].includes(event);
};

/**
 * 判断 AI 消息是否已经包含可保留的输出。
 *
 * 恢复生成会提前插入 AI placeholder。恢复完成或失败后，如果这个 placeholder
 * 没有任何可见内容或运行详情，就应当被移除，避免聊天列表残留空 AI 气泡。
 *
 * 可保留输出包括：
 * - responseData：节点响应详情，即使没有文本也需要保留用于详情查看。
 * - text/reasoning：直接展示给用户的回答或推理内容。
 * - tool/tools：工具调用参数或响应，只有出现 params/response 才算有展示价值。
 * - skills/plan/interactive：Agent 技能、计划和交互节点都会在 UI 中展示。
 *
 * 非 AI 消息永远返回 false，因为该函数只用于判断恢复生成产生的 AI placeholder。
 */
export const hasMeaningfulAiOutput = (chat?: ChatSiteItemType) => {
  if (!chat || chat.obj !== ChatRoleEnum.AI) return false;
  if (chat.responseData?.length) return true;

  return chat.value.some((item) => {
    // 文本和推理内容允许分块增量追加，只要已有内容就需要保留。
    if (item.text?.content) return true;
    if (item.reasoning?.content) return true;
    // 兼容旧的单 tool 字段和新的 tools 数组字段。
    if (item.tool?.params || item.tool?.response) return true;
    if (item.tools?.some((tool) => tool.params || tool.response)) return true;
    // 技能、计划和交互本身就是可见 UI 块，不要求额外文本。
    if (item.skills?.length) return true;
    if (item.plan || item.interactive) return true;
    return false;
  });
};

/**
 * 判断是否应清空恢复流开始前的 AI 占位内容。
 * 仅在「尚未准备 resume AI record」且「尚未收到任何 resume 输出」时重置，
 * 避免恢复过程中误清已 replay 的流式文本或交互状态。
 */
export const shouldResetResumeAiPlaceholder = ({
  hasPreparedResumeAiRecord,
  hasReceivedResumeOutput
}: {
  hasPreparedResumeAiRecord: boolean;
  hasReceivedResumeOutput: boolean;
}) => !hasPreparedResumeAiRecord && !hasReceivedResumeOutput;

/**
 * 判断是否用 resume 占位内容覆盖当前 AI record 的 value。
 * 已有真实 AI 输出时不覆盖；空 record 时可写入「停止中」等提示或占位标记。
 */
export const shouldReplaceResumeAiValue = ({
  hasExistingAiOutput,
  text,
  resetExistingValue
}: {
  hasExistingAiOutput: boolean;
  text: string;
  resetExistingValue?: boolean;
}) => !hasExistingAiOutput && (!!text || !!resetExistingValue);

/**
 * 恢复流结束时，用 completed records 覆盖当前聊天记录，同时保留恢复过程中的中间状态。
 *
 * 覆盖 completed records 会丢失两类恢复期间才存在的数据：
 * 1. 当前 streaming AI record 上 replay 出来的 `responseData`（含 `formInputResult`）；
 * 2. 已提交 `userInput` 交互节点里经 `refreshSubmittedFormInteractiveValues` 回填的 `inputForm.value`。
 *
 * 合并策略：
 * - `responseData`：仅对 `dataId === responseChatId` 的 AI 消息，把 current 中多出的节点响应追加进去（去重）；
 * - 交互值：优先按 `dataId` 匹配 current AI record；匹配不到时，从所有 current AI record 中
 *   按 `areSameInteractive` 身份规则寻找已提交交互并覆盖 completed 里的空值。
 *
 * 若 current 侧既无 replay `responseData` 也无交互态，直接返回 completed records，避免无意义遍历。
 */
export const mergeResumeCompletedChatRecords = ({
  currentRecords,
  completedRecords,
  responseChatId
}: {
  currentRecords: ChatSiteItemType[];
  completedRecords: ChatSiteItemType[];
  responseChatId: string;
}) => {
  const currentAiRecordMap = new Map(
    currentRecords
      .filter(
        (item): item is Extract<ChatSiteItemType, { obj: ChatRoleEnum.AI }> =>
          item.obj === ChatRoleEnum.AI && !!item.dataId
      )
      .map((item) => [item.dataId as string, item])
  );
  const currentAiRecord = currentAiRecordMap.get(responseChatId);
  const resumedResponseData = currentAiRecord?.responseData;
  const hasCurrentInteractive = Array.from(currentAiRecordMap.values()).some((record) =>
    record.value.some((value) => value.interactive)
  );
  if (!resumedResponseData?.length && !hasCurrentInteractive) {
    return completedRecords;
  }

  return completedRecords.map((item) => {
    if (item.obj !== ChatRoleEnum.AI) return item;
    const matchedCurrentAiRecord = item.dataId ? currentAiRecordMap.get(item.dataId) : undefined;
    const shouldMergeResponseData = item.dataId === responseChatId;
    const currentValuesForInteractiveMerge = matchedCurrentAiRecord
      ? matchedCurrentAiRecord.value
      : Array.from(currentAiRecordMap.values()).flatMap((record) => record.value);

    if (!currentValuesForInteractiveMerge.length && !shouldMergeResponseData) return item;

    const mergedResponseData =
      shouldMergeResponseData && resumedResponseData?.length
        ? mergeChatResponseData([
            ...(item.responseData || []),
            ...(resumedResponseData.filter(
              (resumedItem) =>
                !item.responseData?.some((completedItem) =>
                  areSameChatResponseDataItem(completedItem, resumedItem)
                )
            ) || [])
          ])
        : item.responseData;

    return {
      ...item,
      value: mergeSubmittedInteractiveValues({
        completedValues: item.value,
        currentValues: currentValuesForInteractiveMerge
      }),
      responseData: mergedResponseData
    };
  });
};

/**
 * 恢复流 replay 交互节点时，判断是否应 append 到 AI record.value。
 *
 * 核心约束：若 existing 中已有同一身份且已 submitted 的 `userInput`，
 * 则跳过 incoming 的未提交副本，避免空表单覆盖已回填的文件/字段值。
 * 不同身份交互，或同身份但 existing 尚未 submitted（例如中间插入了确认文本），仍允许 append。
 */
export const shouldAppendResumeInteractive = ({
  existingValues,
  incomingInteractive
}: {
  existingValues: AIChatItemValueItemType[];
  incomingInteractive: WorkflowInteractiveResponseType;
}) => {
  const incomingFinalInteractive = extractDeepestInteractive(incomingInteractive);
  const lastExistingInteractive = existingValues[existingValues.length - 1]?.interactive;

  if (!lastExistingInteractive) return true;

  const existingFinalInteractive = extractDeepestInteractive(lastExistingInteractive);
  const isSameInteractive =
    existingFinalInteractive.type === incomingFinalInteractive.type &&
    (existingFinalInteractive.usageId === incomingFinalInteractive.usageId ||
      isSameArray(existingFinalInteractive.entryNodeIds, incomingFinalInteractive.entryNodeIds));

  if (!isSameInteractive) return true;

  return !(
    existingFinalInteractive.type === 'userInput' && existingFinalInteractive.params.submitted
  );
};

const areSameChatResponseDataItem = (a: ChatHistoryItemResType, b: ChatHistoryItemResType) =>
  a.id === b.id && a.nodeId === b.nodeId;

/** 判断两个交互是否为同一轮工作流交互（比较最内层 interactive，而非 child 包装层）。 */
const areSameInteractive = (
  a: WorkflowInteractiveResponseType,
  b: WorkflowInteractiveResponseType
) => {
  const finalA = extractDeepestInteractive(a);
  const finalB = extractDeepestInteractive(b);

  return (
    finalA.type === finalB.type &&
    // 同一轮交互：usageId 相同，或 entryNodeIds 数组完全一致（dataId 变化时仍视为同一表单）
    (finalA.usageId === finalB.usageId || isSameArray(finalA.entryNodeIds, finalB.entryNodeIds))
  );
};

/**
 * 将 current 侧已提交的 `userInput` 交互写回 completed 侧同身份交互节点。
 * completed record 持久化后 `inputForm.value` 可能为空（尤其 fileSelect URL 数组），
 * 而恢复流 replay 期间已在 current record 中 hydrate 过，此处防止覆盖时丢失。
 */
const mergeSubmittedInteractiveValues = ({
  completedValues,
  currentValues
}: {
  completedValues: AIChatItemValueItemType[];
  currentValues: AIChatItemValueItemType[];
}) => {
  const currentSubmittedInteractives = currentValues
    .map((value) => value.interactive)
    .filter((interactive): interactive is WorkflowInteractiveResponseType => {
      if (!interactive) return false;

      const finalInteractive = extractDeepestInteractive(interactive);
      return finalInteractive.type === 'userInput' && !!finalInteractive.params.submitted;
    });

  if (!currentSubmittedInteractives.length) return completedValues;

  let hasUpdated = false;
  const nextValues = completedValues.map((value) => {
    if (!value.interactive) return value;

    const finalInteractive = extractDeepestInteractive(value.interactive);
    if (finalInteractive.type !== 'userInput') {
      return value;
    }

    const currentInteractive = currentSubmittedInteractives.find((interactive) =>
      areSameInteractive(interactive, value.interactive!)
    );
    if (!currentInteractive) return value;

    hasUpdated = true;
    return {
      ...value,
      interactive: currentInteractive
    };
  });

  return hasUpdated ? nextValues : completedValues;
};

const isSameArray = (a?: string[], b?: string[]) => {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
};
