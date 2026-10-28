import type {
  AIChatItemValueItemType,
  ChatItemMiniType,
  ChatItemValueItemType,
  RuntimeUserPromptType,
  SystemChatItemValueItemType,
  ToolModuleResponseItemType,
  UserChatItemFileItemType,
  UserChatItemType,
  UserChatItemValueItemType
} from './type';
import { ChatFileTypeEnum, ChatRoleEnum } from '../../core/chat/constants';
import type {
  ChatCompletionContentPart,
  ChatCompletionFunctionMessageParam,
  ChatCompletionMessageFunctionCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam
} from '../ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '../../core/ai/constants';
import { normalizeToolResponseContent } from '../ai/llm/utils';
import { getUserChatSelect, formatUserChatSelect, userChatSelect2RuntimeText } from './input/utils';
import {
  getWorkflowBuilderPreview,
  getWorkflowBuilderPreviewDecision,
  getWorkflowBuilderPreviewToolResponse
} from '../workflow/builder/utils';
import { WORKFLOW_BUILDER_PREVIEW_TOOL_NAME } from '../workflow/builder/constants';
import { ChatCompletionUserMessageParamSchema } from '../ai/llm/type';
import { AgentAskInteractiveSchema } from '../workflow/template/system/interactive/type';
import { extractDeepestInteractive } from '../workflow/runtime/utils';
import { formatAgentAskAnswers, parseAgentAskAnswers } from '../ai/agent/utils';

type FileUrlChatFileType = ChatFileTypeEnum.file | ChatFileTypeEnum.audio | ChatFileTypeEnum.video;
type FileUrlContentPart = Extract<ChatCompletionContentPart, { type: 'file_url' }>;
type FileUrlContentFileType = NonNullable<FileUrlContentPart['fileType']>;

const fileUrlChatFileTypeSet = new Set<ChatFileTypeEnum>([
  ChatFileTypeEnum.file,
  ChatFileTypeEnum.audio,
  ChatFileTypeEnum.video
]);

export const isFileUrlChatFileType = (type?: ChatFileTypeEnum): type is FileUrlChatFileType =>
  !!type && fileUrlChatFileTypeSet.has(type);

const fileUrlType2ChatFileType: Record<FileUrlContentFileType, FileUrlChatFileType> = {
  file: ChatFileTypeEnum.file,
  audio: ChatFileTypeEnum.audio,
  video: ChatFileTypeEnum.video
};

const getFileUrlChatFileType = (fileType?: FileUrlContentFileType) =>
  fileUrlType2ChatFileType[fileType || 'file'];

export const GPT2Chat = {
  [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.System,
  [ChatCompletionRequestMessageRoleEnum.Developer]: ChatRoleEnum.System,
  [ChatCompletionRequestMessageRoleEnum.User]: ChatRoleEnum.Human,
  [ChatCompletionRequestMessageRoleEnum.Assistant]: ChatRoleEnum.AI,
  [ChatCompletionRequestMessageRoleEnum.Function]: ChatRoleEnum.AI,
  [ChatCompletionRequestMessageRoleEnum.Tool]: ChatRoleEnum.AI
};

/**
 * 将 OpenAI/GPT message role 映射为 FastGPT 内部聊天角色。
 * function/tool message 本质上属于 AI 轮次的工具上下文，因此统一归到 AI。
 */
export function adaptRole_Message2Chat(role: `${ChatCompletionRequestMessageRoleEnum}`) {
  return GPT2Chat[role];
}

/**
 * 压缩用户 content part：单纯文本保持旧版 string 结构，多模态或多段内容保留数组。
 * 这样既兼容历史文本模型上下文，又不会丢失图片/文件等结构化输入。
 */
export const simpleUserContentPart = (content: ChatCompletionContentPart[]) => {
  if (content.length === 1 && content[0].type === 'text') {
    return content[0].text;
  }
  return content;
};

// 获取最后一个压缩检查点的位置。检查点会替代它之前的普通上下文。
const getLatestCheckpointPosition = (messages: ChatItemMiniType[]) => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const item = messages[index];
    if (item.obj !== ChatRoleEnum.AI) continue;

    for (let valueIndex = item.value.length - 1; valueIndex >= 0; valueIndex--) {
      if (!item.value[valueIndex].displayOnly && item.value[valueIndex].contextCheckpoint) {
        return {
          historyIndex: index,
          valueIndex
        };
      }
    }
  }

  return;
};

/**
 * 根据最后一个 contextCheckpoint 重建待请求的历史。
 * checkpoint 前只保留 System 历史，避免压缩后的上下文又叠加旧对话导致重复计入。
 */
const getCheckpointAwareMessages = (messages: ChatItemMiniType[]) => {
  const checkpointPosition = getLatestCheckpointPosition(messages);
  if (!checkpointPosition) return messages;

  // Checkpoint resets chat history, but leading system histories still describe the runtime.
  const systemMessages = messages
    .slice(0, checkpointPosition.historyIndex)
    .filter((item) => item.obj === ChatRoleEnum.System);

  const checkpointAndRecentMessages = messages
    .slice(checkpointPosition.historyIndex)
    .map((item, index) => {
      if (index !== 0 || item.obj !== ChatRoleEnum.AI) return item;

      return {
        ...item,
        value: item.value.slice(checkpointPosition.valueIndex)
      };
    });

  return [...systemMessages, ...checkpointAndRecentMessages];
};

/**
 * 规整 assistant 拆分字段消息。
 *
 * FastGPT 历史为了 UI 展示会把 reasoning、text、tools 拆成多个 value；转成 GPT message
 * 时需要合并为 provider 能接受的 assistant message：
 * - 只合并相邻 assistant message，不跨 user/tool/system/function 等 role 处理。
 * - reasoning_content 和 content 直接字符串拼接；这些拆分通常来自历史兼容，不能额外插入换行。
 * - tool_calls 合并为同一个数组；function_call 理论上一轮只有一个，异常重复时以后者覆盖前者。
 * - dataId/hideInUI 不同表示来自不同轮次或不同可见性上下文，不能跨边界合并。
 */
export const mergeAssistantFieldMessages = (
  messages: ChatCompletionMessageParam[],
  responseIds?: WeakMap<ChatCompletionMessageParam, string>
) => {
  type AssistantMessage = Extract<ChatCompletionMessageParam, { role: 'assistant' }>;

  const hasSameAssistantContext = (
    message: ChatCompletionMessageParam | undefined,
    assistantMessage: ChatCompletionMessageParam
  ) =>
    (message?.hideInUI ?? false) === (assistantMessage.hideInUI ?? false) &&
    message?.dataId === assistantMessage.dataId &&
    (!message || responseIds?.get(message) === responseIds?.get(assistantMessage));

  const appendText = (current: unknown, next: unknown) => {
    if (typeof next !== 'string') return current;
    return typeof current === 'string' ? `${current}${next}` : next;
  };

  const mergeAssistantMessage = (current: AssistantMessage, next: AssistantMessage) => {
    current.reasoning_content = appendText(current.reasoning_content, next.reasoning_content) as
      | string
      | undefined;
    current.content = appendText(current.content, next.content) as AssistantMessage['content'];

    if (Array.isArray(next.tool_calls) && next.tool_calls.length) {
      current.tool_calls = [...(current.tool_calls || []), ...next.tool_calls];
    }

    if (next.function_call) {
      current.function_call = next.function_call;
    }
  };

  const mergedMessages: ChatCompletionMessageParam[] = [];

  for (let index = 0; index < messages.length; index++) {
    const currentMessage = messages[index];
    if (currentMessage.role !== ChatCompletionRequestMessageRoleEnum.Assistant) {
      mergedMessages.push(currentMessage);
      continue;
    }

    const assistantMessage: AssistantMessage = {
      ...currentMessage,
      ...(Array.isArray(currentMessage.tool_calls)
        ? { tool_calls: [...currentMessage.tool_calls] }
        : {})
    };
    const responseId = responseIds?.get(currentMessage);
    if (responseId) responseIds?.set(assistantMessage, responseId);
    let cursor = index + 1;

    while (
      messages[cursor]?.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
      hasSameAssistantContext(messages[cursor], assistantMessage)
    ) {
      mergeAssistantMessage(
        assistantMessage,
        messages[cursor] as Extract<ChatCompletionMessageParam, { role: 'assistant' }>
      );
      cursor++;
    }

    mergedMessages.push(assistantMessage);
    index = cursor - 1;
  }

  return mergedMessages;
};

const isPureTextAiValue = (item: AIChatItemValueItemType) =>
  !!item.text &&
  !item.modelResponseId &&
  !item.inputContext &&
  !item.userMessage &&
  !item.displayOnly &&
  !item.toolResponses &&
  !item.id &&
  !item.askId &&
  !item.reasoning &&
  !item.tools &&
  !item.skills &&
  !item.interactive &&
  !item.plan &&
  !item.planStatus &&
  !item.agentPlanUpdate &&
  !item.agentAsk &&
  !item.contextCheckpoint &&
  !item.tool &&
  !item.hideReason &&
  !item.hideInUI;

/**
 * 规整 AI chat value。
 *
 * 运行期可能把普通回答拆成很多连续 text value，甚至连续追加空 text 占位。这里在适配层
 * 归一化这些纯文本片段：非空纯文本连续时合并，纯空 text 占位直接丢弃；如果最终没有
 * 任何可保存 value，再补一个空 text。带 reasoning、interactive、tool、plan 等语义字段
 * 的 value 保持独立边界。
 */
export const normalizeAIChatValue = (values: AIChatItemValueItemType[]) => {
  const result: AIChatItemValueItemType[] = [];

  values.forEach((item) => {
    if (!isPureTextAiValue(item)) {
      result.push(item);
      return;
    }

    const text = item.text?.content || '';
    if (!text) return;

    const lastItem = result[result.length - 1];
    if (lastItem && isPureTextAiValue(lastItem)) {
      lastItem.text!.content += text;
      return;
    }

    result.push(item);
  });

  if (result.length === 0) {
    result.push({
      text: { content: '' }
    });
  }

  return result;
};

/**
 * 将 FastGPT 内部 ChatItem 历史转换为 GPT request messages。
 *
 * 关键约定：
 * - reserveTool=false 时只保留自然语言上下文，不把历史工具调用带入分类/普通对话。
 * - reserveReason=false 时去掉 reasoning_content，适用于问题分类等不需要思考过程的节点。
 * - reserveId=true 时保留 dataId，供需要按轮次追踪的调用方使用。
 * - 输出前会调用 mergeAssistantFieldMessages，保证 reasoning 不以独立 assistant message 出现。
 */
export const chats2GPTMessages = ({
  messages,
  reserveId,
  reserveTool = false,
  reserveReason = true,
  reserveSelect = false
}: {
  messages: ChatItemMiniType[];
  reserveId: boolean;
  reserveTool?: boolean;
  reserveReason?: boolean;
  /** ChatBox 请求传输保留结构化输入；发送给模型时转换为文本或工具结果。 */
  reserveSelect?: boolean;
}): ChatCompletionMessageParam[] => {
  let results: ChatCompletionMessageParam[] = [];
  const responseIds = new WeakMap<ChatCompletionMessageParam, string>();
  const sourceMessages = getCheckpointAwareMessages(messages);
  const inputContexts = new Map<number, NonNullable<AIChatItemValueItemType['inputContext']>>();
  if (!reserveSelect)
    sourceMessages.forEach((item, index) => {
      if (item.obj !== ChatRoleEnum.AI || sourceMessages[index - 1]?.obj !== ChatRoleEnum.Human)
        return;
      const inputContext = item.value.find(
        (value) => !value.displayOnly && value.inputContext
      )?.inputContext;
      if (inputContext) {
        const parsed = ChatCompletionUserMessageParamSchema.safeParse({
          role: 'user',
          ...inputContext
        });
        if (parsed.success) inputContexts.set(index - 1, parsed.data);
      }
    });
  const resumedToolResponses = new Map<string, string>();
  if (!reserveSelect)
    sourceMessages.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI)
        item.value.forEach((value) => {
          if (!value.displayOnly)
            value.toolResponses?.forEach((result) =>
              resumedToolResponses.set(result.id, result.response)
            );
        });
    });

  /** toolChildrenInteractive 属于父工具续跑，不能把子 Ask 伪造为父模型的 ask_user 调用。 */
  const getParentInteractiveToolId = (interactive?: AIChatItemValueItemType['interactive']) => {
    let current = interactive;
    for (let depth = 0; current && depth < 100; depth++) {
      if (current.type === 'toolChildrenInteractive') return current.params?.toolParams?.toolCallId;
      if (!current.params || !('childrenResponse' in current.params)) return;
      current = current.params.childrenResponse;
    }
  };

  /** 新 Ask 只从有效 interactive 恢复；旧 agentAsk/top-level askId 不参与模型请求。 */
  const getAsk = (item?: ChatItemMiniType) => {
    if (item?.obj !== ChatRoleEnum.AI) return;
    const interactive = item.value.findLast(
      (value) => !value.displayOnly && value.interactive
    )?.interactive;
    if (!interactive) return;
    if (getParentInteractiveToolId(interactive)) return;
    const parsed = AgentAskInteractiveSchema.safeParse(extractDeepestInteractive(interactive));
    return parsed.success ? parsed.data : undefined;
  };
  const getAskResponse = (
    ask: NonNullable<ReturnType<typeof getAsk>>,
    human?: ChatItemMiniType
  ) => {
    if (human?.obj !== ChatRoleEnum.Human) return 'Waiting for user answer.';
    const select = getUserChatSelect(human.value);
    if (select && select.type !== 'agentAsk') return;
    const text = human.value.map((value) => value.text?.content ?? '').join('');
    const answers =
      select?.type === 'agentAsk'
        ? select.questions.map((question) => question.value)
        : parseAgentAskAnswers(text);
    return formatAgentAskAnswers({
      questions: ask.params.questions,
      answers: answers.length ? answers : [text]
    });
  };

  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  const normalizeToolArguments = (params: unknown) => {
    if (typeof params === 'string') {
      return params || '{}';
    }

    try {
      return JSON.stringify(params ?? {});
    } catch {
      return '{}';
    }
  };

  type NormalizedChatToolContext = {
    toolCall: ChatCompletionMessageToolCall;
    toolResponse: ChatCompletionToolMessageParam;
  };
  const isNormalizedChatToolContext = (
    item: NormalizedChatToolContext | undefined
  ): item is NormalizedChatToolContext => Boolean(item);

  const normalizeChatToolContext = (
    tool?: Partial<ToolModuleResponseItemType> | null
  ): NormalizedChatToolContext | undefined => {
    // 仅用于展示进度的工具记录没有模型上下文，不能据此构造空参数、空响应的虚假调用。
    if (
      !tool ||
      tool.hideDetails ||
      !isNonEmptyString(tool.id) ||
      !isNonEmptyString(tool.functionName)
    ) {
      return;
    }
    const response = resumedToolResponses.get(tool.id) ?? tool.response;
    if (typeof response !== 'string') return;

    const id = tool.id.trim();
    const functionName = tool.functionName.trim();

    return {
      toolCall: {
        id,
        type: 'function' as const,
        function: {
          name: functionName,
          arguments: normalizeToolArguments(tool.params)
        }
      },
      toolResponse: {
        tool_call_id: id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        content: normalizeToolResponseContent(response)
      }
    };
  };
  /** 只消费实际展示的末次预览调用，避免把同轮语法校验失败的调用也补成已确认。 */
  const getPreviewToolContext = (item?: ChatItemMiniType) => {
    if (item?.obj !== ChatRoleEnum.AI) return;
    const preview = getWorkflowBuilderPreview(item.value);
    if (!preview) return;
    const interactive = item.value.findLast((value) => value.interactive)?.interactive;
    const toolCallId =
      interactive?.type === 'toolChildrenInteractive'
        ? interactive.params.toolParams.toolCallId
        : undefined;
    const tool = item.value
      .flatMap((value) => value.tools ?? (value.tool ? [value.tool] : []))
      .findLast(
        (tool) =>
          tool.functionName === WORKFLOW_BUILDER_PREVIEW_TOOL_NAME &&
          (!toolCallId || tool.id === toolCallId) &&
          normalizeChatToolContext(tool)
      );
    return tool ? { preview, toolCallId: tool.id } : undefined;
  };

  sourceMessages.forEach((item, index) => {
    const dataId = reserveId ? item.dataId : undefined;
    if (item.obj === ChatRoleEnum.System) {
      const content = item.value?.[0]?.text?.content;
      if (content) {
        results.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.System,
          content
        });
      }
    } else if (item.obj === ChatRoleEnum.Human) {
      const inputContext = inputContexts.get(index);
      if (inputContext) {
        results.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.User,
          ...inputContext,
          hideInUI: item.hideInUI
        });
        return;
      }
      const previous = sourceMessages[index - 1];
      const isAskReply =
        !reserveSelect &&
        reserveTool &&
        previous?.obj === ChatRoleEnum.AI &&
        !!getAsk(previous) &&
        getAskResponse(getAsk(previous)!, item) !== undefined;
      const previousPreview =
        !reserveSelect && reserveTool ? getPreviewToolContext(previous) : undefined;
      const isPreviewReply =
        previousPreview &&
        getWorkflowBuilderPreviewDecision({ preview: previousPreview.preview, userContent: item });
      const parentToolId =
        previous?.obj === ChatRoleEnum.AI
          ? getParentInteractiveToolId(
              previous.value.findLast((value) => !value.displayOnly && value.interactive)
                ?.interactive
            )
          : undefined;
      const isChildToolReply =
        !reserveSelect && reserveTool && parentToolId && resumedToolResponses.has(parentToolId);
      const value = item.value
        // Ask 和 Preview 的回答只作为紧邻工具的 response 消费一次，文件仍保留为多模态输入。
        .filter((value) => !isChildToolReply && ((!isAskReply && !isPreviewReply) || !!value.file))
        .map((item) => {
          const select = getUserChatSelect([item]);
          if (select)
            return reserveSelect
              ? { type: 'select', select }
              : { type: 'text', text: formatUserChatSelect(select) };
          if (item.text) {
            return {
              type: 'text',
              text: item.text?.content || ''
            };
          }
          if (item.file) {
            if (item.file?.type === ChatFileTypeEnum.image) {
              return {
                type: 'image_url',
                key: item.file.key,
                image_url: {
                  url: item.file.url
                }
              };
            } else if (isFileUrlChatFileType(item.file?.type)) {
              return {
                type: 'file_url',
                name: item.file?.name || '',
                url: item.file.url,
                fileType: item.file.type,
                key: item.file.key
              };
            }
          }
        })
        .filter(Boolean) as ChatCompletionContentPart[];

      if (value.length) {
        results.push({
          dataId,
          hideInUI: item.hideInUI,
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: simpleUserContentPart(value)
        });
      }
    } else {
      const aiResults: ChatCompletionMessageParam[] = [];
      // 仅消费紧接着的 user，遇到缺失或其他角色按错乱数据返回空结果，不跨消息查找。
      const next = sourceMessages[index + 1];
      // ChatBox 传输保留原始展示值；仅在构造模型上下文时把 Human 决策投影到工具结果。
      const previewContext =
        !reserveSelect && reserveTool ? getPreviewToolContext(item) : undefined;
      const previewDecision =
        previewContext && next?.obj === ChatRoleEnum.Human
          ? getWorkflowBuilderPreviewDecision({
              preview: previewContext.preview,
              userContent: next
            })
          : undefined;

      const appendAssistantToolCall = ({
        id,
        functionName,
        params,
        hideInUI
      }: {
        id: string;
        functionName: string;
        params: string;
        hideInUI?: boolean;
      }) => {
        const normalizedToolContext = normalizeChatToolContext({
          id,
          functionName,
          params,
          response: ''
        });

        if (!normalizedToolContext) {
          // tool 元数据不完整时丢弃非法 tool_call；assistant 输出由独立 value 保存。
          return false;
        }

        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          ...(hideInUI ? { hideInUI } : {}),
          tool_calls: [normalizedToolContext.toolCall]
        });
        return normalizedToolContext;
      };

      const appendAssistantReasoning = (content: string, hideInUI?: boolean) => {
        if (!reserveReason || !content) return;

        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          ...(hideInUI ? { hideInUI } : {}),
          reasoning_content: content
        });
      };

      const appendAssistantText = (content: string, hideInUI?: boolean) => {
        if (!content && item.value.length > 1) return;

        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          ...(hideInUI ? { hideInUI } : {}),
          content
        });
      };

      const appendToolMessage = ({ id, response }: { id: string; response: string }) => {
        aiResults.push({
          dataId,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: id,
          content: normalizeToolResponseContent(response)
        });
      };

      const pendingRuntimeToolResponses: ChatCompletionToolMessageParam[] = [];
      const flushPendingRuntimeToolResponses = () => {
        if (!pendingRuntimeToolResponses.length) return;

        aiResults.push(...pendingRuntimeToolResponses);
        pendingRuntimeToolResponses.length = 0;
      };

      item.value.forEach((value) => {
        if (value.displayOnly) return;
        if (value.modelResponseId && !value.contextCheckpoint) {
          flushPendingRuntimeToolResponses();
          const contexts = reserveTool
            ? (value.tools ?? []).map(normalizeChatToolContext).filter(isNormalizedChatToolContext)
            : [];
          const currentAsk = getAsk({ ...item, value: [value] });
          if (reserveTool && currentAsk) {
            const response = getAskResponse(currentAsk, next);
            if (response !== undefined)
              contexts.push({
                toolCall: {
                  id: currentAsk.params.askId,
                  type: 'function',
                  function: {
                    name: 'ask_user',
                    arguments: JSON.stringify({
                      reason: currentAsk.params.description,
                      blockerType: currentAsk.params.blockerType,
                      questions: currentAsk.params.questions
                    })
                  }
                },
                toolResponse: {
                  role: ChatCompletionRequestMessageRoleEnum.Tool,
                  tool_call_id: currentAsk.params.askId,
                  content: response
                }
              });
          }
          contexts.sort(
            (a, b) =>
              (value.toolCallIds?.indexOf(a.toolCall.id) ?? 0) -
              (value.toolCallIds?.indexOf(b.toolCall.id) ?? 0)
          );
          const assistant: ChatCompletionMessageParam = {
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            ...(value.text?.content ? { content: value.text.content } : {}),
            ...(reserveReason && value.reasoning?.content
              ? { reasoning_content: value.reasoning.content }
              : {}),
            ...(contexts.length ? { tool_calls: contexts.map((context) => context.toolCall) } : {})
          };
          if (assistant.content || assistant.reasoning_content || contexts.length) {
            responseIds.set(assistant, value.modelResponseId);
            aiResults.push(assistant);
          }
          contexts.forEach(({ toolCall, toolResponse }) => {
            if (previewDecision && toolCall.id === previewContext?.toolCallId) {
              let original: Record<string, unknown> = {};
              try {
                const parsed = JSON.parse(String(toolResponse.content));
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                  original = parsed;
              } catch {}
              toolResponse.content = JSON.stringify({
                ...original,
                ...getWorkflowBuilderPreviewToolResponse(previewDecision)
              });
            }
            aiResults.push({ ...toolResponse, dataId });
          });
          return;
        }
        const tools = value.tools ? value.tools : value.tool ? [value.tool] : undefined;
        const hasTools = Array.isArray(tools) && tools.length > 0;
        const startsNewAssistantPayload =
          Boolean(value.userMessage) ||
          Boolean(value.contextCheckpoint) ||
          Boolean(value.agentPlanUpdate) ||
          Boolean(value.agentAsk) ||
          hasTools ||
          typeof value.reasoning?.content === 'string' ||
          typeof value.text?.content === 'string';

        if (startsNewAssistantPayload) {
          flushPendingRuntimeToolResponses();
        }

        if (value.userMessage) {
          aiResults.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: value.userMessage.content,
            hideInUI: true
          });
          return;
        }

        if (value.contextCheckpoint) {
          // checkpoint 会重置之前累积的 AI 字段；同一个 value 上的其他字段不再参与上下文。
          results = results.concat(mergeAssistantFieldMessages(aiResults, responseIds));
          aiResults.length = 0;
          results.push({
            dataId,
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: value.contextCheckpoint,
            hideInUI: true
          });
          return;
        }

        // agent plan card
        if (reserveTool && value.agentPlanUpdate) {
          const appendedToolCall = appendAssistantToolCall({
            id: value.agentPlanUpdate.id,
            functionName: value.agentPlanUpdate.functionName,
            params: value.agentPlanUpdate.params,
            hideInUI: value.hideInUI
          });
          if (appendedToolCall && typeof value.agentPlanUpdate.response === 'string') {
            appendToolMessage({
              id: appendedToolCall.toolCall.id,
              response: value.agentPlanUpdate.response
            });
          }
        }

        // Agent ask tool
        if (reserveTool && value.interactive) {
          const ask = getAsk({ ...item, value: [value] });
          const response = ask ? getAskResponse(ask, next) : undefined;
          if (ask && response !== undefined) {
            appendAssistantToolCall({
              id: ask.params.askId,
              functionName: 'ask_user',
              params: JSON.stringify({
                reason: ask.params.description,
                blockerType: ask.params.blockerType,
                questions: ask.params.questions
              })
            });
            appendToolMessage({ id: ask.params.askId, response });
          }
        }

        if (typeof value.reasoning?.content === 'string') {
          appendAssistantReasoning(value.reasoning.content, value.hideInUI);
        }

        if (typeof value.text?.content === 'string') {
          appendAssistantText(value.text.content, value.hideInUI);
        }

        if (reserveTool && hasTools) {
          const normalizedToolContexts = tools
            .map((tool) => normalizeChatToolContext(tool))
            .filter(isNormalizedChatToolContext);

          // 清除无效 tool 后，还有 tool 才推送
          if (normalizedToolContexts.length) {
            const tool_calls = normalizedToolContexts.map((item) => item.toolCall);
            const toolResponse = normalizedToolContexts.map(({ toolCall, toolResponse }) => {
              if (!previewDecision || toolCall.id !== previewContext?.toolCallId)
                return toolResponse;
              const originalResponse = (() => {
                try {
                  const parsed = JSON.parse(String(toolResponse.content));
                  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? parsed
                    : {};
                } catch {
                  return {};
                }
              })();
              return {
                ...toolResponse,
                content: JSON.stringify({
                  ...originalResponse,
                  ...getWorkflowBuilderPreviewToolResponse(previewDecision)
                })
              };
            });

            const assistantMessage: ChatCompletionMessageParam = {
              dataId,
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              ...(value.hideInUI ? { hideInUI: value.hideInUI } : {}),
              tool_calls
            };

            aiResults.push(assistantMessage);
            pendingRuntimeToolResponses.push(...toolResponse);
          }
        }
      });

      // AI value 遍历结束后统一合并，处理 reasoning/text/tools 分散存储的兼容格式。
      flushPendingRuntimeToolResponses();
      results = results.concat(mergeAssistantFieldMessages(aiResults, responseIds));
    }
  });

  return results;
};

/**
 * 将 GPT messages 转回 FastGPT ChatItem。
 *
 * GPTMessages2Chats 会先清洗连续 assistant message，再做 message -> chat value 的结构转换。
 * 这样不同 provider 或历史兼容格式拆出的 reasoning/text/tool_calls，都会先归一成一轮
 * assistant payload。
 */
export const GPTMessages2Chats = ({
  messages,
  reserveTool = true,
  reserveReason = true,
  getToolInfo
}: {
  messages: ChatCompletionMessageParam[];
  reserveTool?: boolean;
  reserveReason?: boolean;
  getToolInfo?: (name: string) => { name: string; avatar?: string } | undefined;
}): ChatItemMiniType[] => {
  const normalizedMessages = mergeAssistantFieldMessages(messages);
  const chatMessages = normalizedMessages
    .map((item) => {
      const obj = GPT2Chat[item.role];

      if (
        obj === ChatRoleEnum.System &&
        item.role === ChatCompletionRequestMessageRoleEnum.System
      ) {
        const value: SystemChatItemValueItemType[] = [];

        if (Array.isArray(item.content)) {
          item.content.forEach((item) => [
            value.push({
              text: {
                content: item.text
              }
            })
          ]);
        } else {
          value.push({
            text: {
              content: item.content
            }
          });
        }
        return {
          dataId: item.dataId,
          obj,
          hideInUI: item.hideInUI,
          value
        };
      } else if (
        obj === ChatRoleEnum.Human &&
        item.role === ChatCompletionRequestMessageRoleEnum.User
      ) {
        const value: UserChatItemValueItemType[] = [];

        if (typeof item.content === 'string') {
          value.push({
            text: {
              content: item.content
            }
          });
        } else if (Array.isArray(item.content)) {
          item.content.forEach((item) => {
            if (item.type === 'text') {
              value.push({
                text: {
                  content: item.text
                }
              });
            } else if (item.type === 'select') {
              value.push({ select: item.select });
            } else if (item.type === 'image_url') {
              value.push({
                file: {
                  type: ChatFileTypeEnum.image,
                  name: '',
                  url: item.image_url.url,
                  key: item.key
                }
              });
            } else if (item.type === 'file_url') {
              value.push({
                file: {
                  type: getFileUrlChatFileType(item.fileType),
                  name: item.name || '',
                  url: item.url,
                  key: item.key
                }
              });
            }
          });
        }
        return {
          dataId: item.dataId,
          obj,
          hideInUI: item.hideInUI,
          value
        };
      } else if (
        obj === ChatRoleEnum.AI &&
        item.role === ChatCompletionRequestMessageRoleEnum.Assistant
      ) {
        const value: AIChatItemValueItemType[] = [];
        const valueVisibility = item.hideInUI ? { hideInUI: item.hideInUI } : {};
        const reasoning: Pick<AIChatItemValueItemType, 'reasoning'> =
          typeof item.reasoning_content === 'string' && item.reasoning_content && reserveReason
            ? { reasoning: { content: item.reasoning_content } }
            : {};
        let hasAttachedReasoning = false;

        if (typeof item.content === 'string' && item.content) {
          value.push({
            ...valueVisibility,
            ...reasoning,
            text: {
              content: item.content
            }
          });
          hasAttachedReasoning = Boolean(reasoning.reasoning);
        }

        if (item.tool_calls && reserveTool) {
          // tool response 存在于独立 tool message 中，这里按 tool_call_id 回查并折回 ChatItem.tools。
          const toolCalls = item.tool_calls as ChatCompletionMessageToolCall[];

          const tools = toolCalls.flatMap<ToolModuleResponseItemType>((tool) => {
            let toolResponse =
              normalizedMessages.find(
                (msg) =>
                  msg.role === ChatCompletionRequestMessageRoleEnum.Tool &&
                  msg.tool_call_id === tool.id
              )?.content || '';
            toolResponse =
              typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);

            const toolInfo = getToolInfo?.(tool.function.name);

            return [
              {
                id: tool.id,
                toolName: toolInfo?.name || '',
                toolAvatar: toolInfo?.avatar || '',
                functionName: tool.function.name,
                params: tool.function.arguments,
                response: toolResponse as string
              }
            ];
          });
          if (tools.length) {
            value.push({
              ...valueVisibility,
              ...(!hasAttachedReasoning ? reasoning : {}),
              tools
            });
            hasAttachedReasoning = hasAttachedReasoning || Boolean(reasoning.reasoning);
          }
        }

        if (item.function_call && reserveTool) {
          const functionCall = item.function_call as ChatCompletionMessageFunctionCall;
          const functionResponse = normalizedMessages.find(
            (msg) =>
              msg.role === ChatCompletionRequestMessageRoleEnum.Function &&
              msg.name === item.function_call?.name
          ) as ChatCompletionFunctionMessageParam;

          if (functionResponse) {
            value.push({
              ...valueVisibility,
              ...(!hasAttachedReasoning ? reasoning : {}),
              tool: {
                id: functionCall.id || '',
                toolName: functionCall.toolName || '',
                toolAvatar: functionCall.toolAvatar || '',
                functionName: functionCall.name,
                params: functionCall.arguments,
                response: functionResponse.content || ''
              }
            });
            hasAttachedReasoning = hasAttachedReasoning || Boolean(reasoning.reasoning);
          }
        }

        if (reasoning.reasoning && !hasAttachedReasoning) {
          value.push({
            ...valueVisibility,
            ...reasoning
          });
        }

        if (item.interactive) {
          value.push({
            interactive: item.interactive,
            ...valueVisibility
          });
        }

        return {
          dataId: item.dataId,
          obj,
          value
        };
      }

      return {
        dataId: item.dataId,
        obj,
        hideInUI: item.hideInUI,
        value: []
      };
    })
    .filter((item) => item.value.length > 0);

  // 相邻同 dataId/obj 的记录归并，保持一轮 AI 多个 value 在同一个 ChatItem 中展示。
  const result = chatMessages.reduce((result: ChatItemMiniType[], currentItem) => {
    const lastItem = result[result.length - 1];

    if (lastItem && lastItem.dataId === currentItem.dataId && lastItem.obj === currentItem.obj) {
      // @ts-ignore
      lastItem.value = lastItem.value.concat(currentItem.value);
    } else {
      result.push(currentItem);
    }

    return result;
  }, []);

  return result;
};

/**
 * 将聊天 value 提取成运行时用户输入。文件保留结构，文本按展示顺序拼接。
 */
export const chatValue2RuntimePrompt = (value: ChatItemValueItemType[]): RuntimeUserPromptType => {
  const prompt: RuntimeUserPromptType = {
    files: [],
    text: ''
  };
  value.forEach((item) => {
    if ('file' in item && item.file) {
      prompt.files.push(item.file);
    } else if ('select' in item) {
      const select = getUserChatSelect([item]);
      if (select) prompt.text += userChatSelect2RuntimeText(select);
    } else if (item.text) {
      prompt.text += item.text.content;
    }
  });
  return prompt;
};

/**
 * 将运行时 prompt 恢复为用户聊天 value，主要用于调试/重放入口。
 */
export const runtimePrompt2ChatsValue = (prompt: {
  files?: UserChatItemFileItemType[];
  text?: string;
}): UserChatItemType['value'] => {
  const value: UserChatItemType['value'] = [];
  if (prompt.files) {
    prompt.files.forEach((file) => {
      value.push({
        file
      });
    });
  }
  if (prompt.text) {
    value.push({
      text: {
        content: prompt.text
      }
    });
  }
  return value;
};

/**
 * 用一条 System ChatItem 包装系统提示词，便于统一走 ChatItem -> GPT message 转换链。
 */
export const getSystemPrompt_ChatItemType = (prompt?: string): ChatItemMiniType[] => {
  if (!prompt) return [];
  return [
    {
      obj: ChatRoleEnum.System,
      value: [{ text: { content: prompt } }]
    }
  ];
};
