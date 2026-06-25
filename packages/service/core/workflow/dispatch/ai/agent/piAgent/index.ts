import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getHistories, getNodeErrResponse } from '../../../utils';
import { parsePiAgentSystemPrompt } from '../sub/plan/prompt';
import { formatFileInput } from '../sub/file/utils';
import { normalizeSkillIds } from '@fastgpt/global/core/app/formEdit/type';
import { systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { i18nT, parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getSubapps } from '../utils';
import { createCapabilityToolCallHandler, type AgentCapability } from '../capability/type';
import { createSandboxSkillsCapability } from '../capability/sandboxSkills';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { buildPiModel, getModelApiKey } from './modelBridge';
import { buildAgentTools, type ToolDispatchContext } from './toolAdapter';
import { createCompactionTransform } from './compaction';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { env } from '../../../../../../env';
import type { DispatchAgentModuleProps } from '..';
import { resolveDatasetParams } from '../resolveDatasetParams';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import { hashStr, getNanoid } from '@fastgpt/global/common/string/tools';
import { getLLMModelById } from '../../../../../ai/model';
import { compressLargeContent } from '../../../../../ai/llm/compress';
import { countPromptTokens } from '../../../../../../common/string/tiktoken';
import { formatModelChars2Points } from '../../../../../../support/wallet/usage/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchPiAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  const {
    checkIsStopping,
    node: { nodeId, inputs },
    lang,
    histories,
    query: _query,
    requestOrigin,
    chatConfig,
    runningAppInfo,
    workflowStreamResponse,
    usagePush,
    mode,
    chatId,
    showSkillReferences,
    params: {
      modelId,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinksInput,
      agent_selectedTools: selectedTools = [],
      skills: skillIds = [],
      useAgentSandbox = false,
      aiChatVision,
      aiChatReasoning = true
    }
  } = props;
  // Dataset search: resolve from composite or individual fields
  const datasetParams = resolveDatasetParams(props.params);

  const chatHistories = getHistories(history, histories);
  const normalizedSkillIds = normalizeSkillIds(skillIds);

  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];
  const startTime = Date.now();
  const capabilities: AgentCapability[] = [];

  try {
    // Get files — check whether fileUrlList input has actual values
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    const fileLinks =
      fileUrlInput && fileUrlInput.value && fileUrlInput.value.length > 0
        ? fileLinksInput
        : undefined;

    const {
      filesMap,
      allFilesMap,
      prompt: fileInputPrompt
    } = formatFileInput({
      fileUrls: fileLinks,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      histories: chatHistories,
      useSkill: skillIds.length > 0
    });

    // Auto-compress ultra-long user input before piAgent loop
    let finalUserChatInput = userChatInput;
    if (finalUserChatInput) {
      const modelData = getLLMModelById(modelId);
      if (modelData) {
        const inputTokens = await countPromptTokens(finalUserChatInput);
        const threshold = Math.floor(modelData.maxContext * env.USER_INPUT_COMPRESS_THRESHOLD);
        if (inputTokens > threshold) {
          const targetTokens = Math.floor(modelData.maxContext * env.USER_INPUT_COMPRESS_TARGET);
          getLogger(LogCategories.MODULE.AI.AGENT).debug(
            'piAgent user input auto-compression triggered',
            { inputTokens, threshold, targetTokens }
          );
          const result = await compressLargeContent({
            content: finalUserChatInput,
            model: modelData,
            maxTokens: targetTokens
          });
          if (result.compressed && result.compressed !== finalUserChatInput) {
            finalUserChatInput = result.compressed;
            if (result.usage) {
              usagePush([result.usage]);
            }
            // Inject metadata into _query for UI persistence (shared ref with userQuestion.value)
            if (_query && Array.isArray(_query) && _query.length > 0) {
              const firstValue = _query[0];
              if (firstValue?.text) {
                firstValue.text.originalContent = userChatInput;
                firstValue.text.content = result.compressed;
                (firstValue as any).compression = {
                  modelId: modelData.id,
                  inputTokens: result.usage?.inputTokens,
                  outputTokens: result.usage?.outputTokens
                };
              }
            }
          }
        }
      }
    }

    const formatUserChatInput = fileInputPrompt
      ? `${fileInputPrompt}\n\n${finalUserChatInput}`
      : finalUserChatInput;

    // Initialize capabilities — sandbox skills (lazy-init)
    {
      const sandboxSessionId =
        mode === 'chat'
          ? chatId
          : `debug-${hashStr(`${runningAppInfo.id}-${nodeId}-${chatId}`).slice(0, 40)}`;

      const sandboxCap = await createSandboxSkillsCapability({
        skillIds: normalizedSkillIds,
        teamId: runningAppInfo.teamId,
        tmbId: runningAppInfo.tmbId,
        sessionId: sandboxSessionId,
        workflowStreamResponse,
        showSkillReferences: showSkillReferences === true,
        allFilesMap,
        exposeGetFileUrl: true,
        appId: runningAppInfo.id,
        userId: props.uid,
        chatId
      });
      capabilities.push(sandboxCap);
    }

    // Aggregate capability contributions
    const capabilitySystemPrompt = capabilities
      .map((c) => c.systemPrompt)
      .filter(Boolean)
      .join('\n\n');
    const capabilityTools = capabilities.flatMap((c) => c.completionTools ?? []);
    const capabilityToolCallHandler =
      capabilities.length > 0 ? createCapabilityToolCallHandler(capabilities) : undefined;
    // Merge skill path maps from all capabilities for pre-resolving tool display names
    const skillPathMap: Record<string, string> = Object.assign(
      {},
      ...capabilities.map((c) => c.skillPathMap ?? {})
    );

    // Get sub apps — pi-agent-core manages reasoning, no plan tool needed.
    // Skill capability owns the sandbox session: the model uses skill tools
    // (sandbox_write_file / sandbox_execute / ...) and must NEVER see sandbox_shell.
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
        getPlanTool: false,
        hasDataset: datasetParams && datasetParams.datasets.length > 0,
        hasFiles: !!chatConfig?.fileSelectConfig?.canSelectFile,
        useAgentSandbox: useAgentSandbox && !!global.feConfigs?.show_agent_sandbox,
        extraTools: capabilityTools
      }
    );

    const getSubAppInfo = (id: string) => {
      const formatId = id.startsWith('t') ? id.slice(1) : id;
      const userToolNode = agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId);
      if (userToolNode) {
        return {
          name: userToolNode.name || '',
          avatar: userToolNode.avatar || '',
          toolDescription: userToolNode.toolDescription || userToolNode.name || ''
        };
      }
      const systemToolNode = systemSubInfo[id] || systemSubInfo[formatId];
      const systemDisplayName = parseI18nString(systemToolNode?.name, lang);
      return {
        name: systemDisplayName || '',
        avatar: systemToolNode?.avatar || '',
        toolDescription: systemToolNode?.toolDescription || systemDisplayName || ''
      };
    };
    const getSubApp = (id: string) => {
      const formatId = id.slice(1);
      return agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId);
    };

    let formatedSystemPrompt = parsePiAgentSystemPrompt({
      userSystemPrompt: capabilitySystemPrompt
        ? `${systemPrompt || ''}\n\n${capabilitySystemPrompt}`.trim()
        : systemPrompt,
      selectedDataset: datasetParams?.datasets,
      lang
    });

    // Append sandbox system prompt when sandbox is enabled
    // (skipped when skill capability is active — the skill capability owns the sandbox prompt)
    if (useAgentSandbox && global.feConfigs?.show_agent_sandbox) {
      formatedSystemPrompt =
        `${formatedSystemPrompt}\n\n${SANDBOX_SYSTEM_PROMPT}\n\n<ToolPriority>\nWhen both sandbox_shell / sandbox_get_file_url and sandbox_execute_* tools can fulfill the same task, prefer sandbox_shell and sandbox_get_file_url — they have higher priority.\n</ToolPriority>`.trim();
    }

    /* ===== Build pi-agent-core model & tools ===== */
    const piModel = buildPiModel(modelId, aiChatVision);
    const apiKey = getModelApiKey(modelId);

    const toolCtx: ToolDispatchContext = {
      checkIsStopping,
      chatConfig,
      runningUserInfo: props.runningUserInfo,
      runningAppInfo,
      chatId,
      uid: props.uid,
      variables: props.variables,
      externalProvider: props.externalProvider,
      workflowStreamResponse,
      lang,
      requestOrigin,
      mode,
      timezone: props.timezone,
      retainDatasetCite: props.retainDatasetCite,
      maxRunTimes: props.maxRunTimes,
      workflowDispatchDeep: props.workflowDispatchDeep,
      usagePush,
      modelId,
      datasetParams
    };

    const piTools = await buildAgentTools({
      completionTools: agentCompletionTools,
      ctx: toolCtx,
      filesMap,
      getSubApp,
      getSubAppInfo,
      capabilityToolCallHandler,
      nodeResponses,
      assistantResponses,
      skillPathMap
    });

    /* ===== Restore session messages from last AI history ===== */
    const piMessagesKey = `piMessages-${nodeId}`;
    let restoredMessages: any[] = [];
    for (let i = chatHistories.length - 1; i >= 0; i--) {
      if (chatHistories[i].obj === ChatRoleEnum.AI) {
        const aiItem = chatHistories[i] as { memories?: Record<string, any> };
        const stored = aiItem.memories?.[piMessagesKey] as any[] | undefined;
        if (stored?.length) {
          restoredMessages = stored;
          break;
        }
      }
    }

    /* ===== Create & run Agent ===== */
    const { Agent } = await import('@mariozechner/pi-agent-core');
    type AgentEvent = import('@mariozechner/pi-agent-core').AgentEvent;

    const agent: import('@mariozechner/pi-agent-core').Agent = new Agent({
      initialState: {
        systemPrompt: formatedSystemPrompt,
        model: piModel,
        tools: piTools,
        messages: restoredMessages
      },
      getApiKey: () => apiKey,
      transformContext: createCompactionTransform({
        model: piModel,
        apiKey,
        getAgentState: () => agent.state,
        settings: { enabled: env.PI_AGENT_COMPACTION_ENABLED }
      }),
      onPayload: (params: any) => {
        // Ensure tool_choice is set; some models require explicit tool_choice
        if (params.tools?.length > 0 && params.tool_choice === undefined) {
          params.tool_choice = 'auto';
        }
        return params;
      }
    });

    // Collect text deltas to build answerText
    let answerText = '';
    let currentTextItem: AIChatItemValueItemType | null = null;
    let currentReasoningItem: AIChatItemValueItemType | null = null;
    // Separate timers for the two independent reasoning content paths:
    // - xmlReasoningStartTime: set when <think> tag opens (processTextChunk)
    // - deltaReasoningStartTime: set when thinking_delta event first arrives
    // This prevents timing overwrite in hybrid mode where a model emits both
    // thinking_delta events and <think> XML tags within the text stream.
    let xmlReasoningStartTime: number | null = null;
    let deltaReasoningStartTime: number | null = null;

    // Streaming parser for <think>...</think> tags in text content
    // Some models (e.g. MiniMax) emit thinking content as XML tags within the text stream
    // rather than using the standard reasoning_content / thinking delta API.
    let thinkTagBuffer = '';
    let inThinkTag = false;

    /**
     * Process a chunk of text through the <think> tag parser.
     * Routes content inside <think>...</think> as reasoning_content,
     * and content outside as regular text.
     */
    const processTextChunk = (chunk: string) => {
      thinkTagBuffer += chunk;

      // Process the buffer character by character to detect tag boundaries
      while (thinkTagBuffer.length > 0) {
        if (inThinkTag) {
          const closeIdx = thinkTagBuffer.indexOf('</think>');
          if (closeIdx === -1) {
            // No closing tag yet — send all as reasoning
            if (thinkTagBuffer.length > 0) {
              const reasoningText = thinkTagBuffer;
              thinkTagBuffer = '';
              if (aiChatReasoning) {
                if (!currentReasoningItem) {
                  currentReasoningItem = { reasoning: { content: '' } };
                  assistantResponses.push(currentReasoningItem);
                }
                currentReasoningItem.reasoning!.content += reasoningText;
                // Also accumulate in answerText for backward compatibility
                answerText += reasoningText;
                workflowStreamResponse?.({
                  event: SseResponseEventEnum.answer,
                  data: textAdaptGptResponse({ reasoning_content: reasoningText })
                });
              }
            }
            break;
          } else {
            // Send content before closing tag as reasoning
            const reasoningText = thinkTagBuffer.substring(0, closeIdx);
            thinkTagBuffer = thinkTagBuffer.substring(closeIdx + '</think>'.length);
            inThinkTag = false;
            if (aiChatReasoning && reasoningText.length > 0) {
              if (!currentReasoningItem) {
                currentReasoningItem = { reasoning: { content: '' } };
                assistantResponses.push(currentReasoningItem);
              }
              currentReasoningItem.reasoning!.content += reasoningText;
              // Also accumulate in answerText for backward compatibility
              answerText += reasoningText;
              workflowStreamResponse?.({
                event: SseResponseEventEnum.answer,
                data: textAdaptGptResponse({ reasoning_content: reasoningText })
              });
            }
            // Record duration and reset reasoning item so next reasoning starts fresh
            if (currentReasoningItem && xmlReasoningStartTime) {
              currentReasoningItem.reasoning!.duration =
                Math.round((Date.now() - xmlReasoningStartTime) / 1000) || 1;
              xmlReasoningStartTime = null;
            }
            currentReasoningItem = null;
          }
        } else {
          const openIdx = thinkTagBuffer.indexOf('<think>');
          if (openIdx === -1) {
            // Check for partial opening tag at the end
            const partialLen = Math.min(thinkTagBuffer.length, '<think>'.length - 1);
            let partialMatch = false;
            for (let i = 1; i <= partialLen; i++) {
              if ('<think>'.startsWith(thinkTagBuffer.substring(thinkTagBuffer.length - i))) {
                // Keep the partial match in buffer for next chunk
                const safeText = thinkTagBuffer.substring(0, thinkTagBuffer.length - i);
                if (safeText.length > 0) {
                  answerText += safeText;
                  if (!currentTextItem) {
                    currentTextItem = { text: { content: '' } };
                    assistantResponses.push(currentTextItem);
                  }
                  currentTextItem.text!.content += safeText;
                  workflowStreamResponse?.({
                    event: SseResponseEventEnum.answer,
                    data: textAdaptGptResponse({ text: safeText })
                  });
                }
                thinkTagBuffer = thinkTagBuffer.substring(thinkTagBuffer.length - i);
                partialMatch = true;
                break;
              }
            }
            if (!partialMatch) {
              // No tag at all — send all as text
              if (thinkTagBuffer.length > 0) {
                answerText += thinkTagBuffer;
                if (!currentTextItem) {
                  currentTextItem = { text: { content: '' } };
                  assistantResponses.push(currentTextItem);
                }
                currentTextItem.text!.content += thinkTagBuffer;
                workflowStreamResponse?.({
                  event: SseResponseEventEnum.answer,
                  data: textAdaptGptResponse({ text: thinkTagBuffer })
                });
                thinkTagBuffer = '';
              }
            }
            break;
          } else {
            // Send content before opening tag as text
            const textBefore = thinkTagBuffer.substring(0, openIdx);
            thinkTagBuffer = thinkTagBuffer.substring(openIdx + '<think>'.length);
            inThinkTag = true;
            xmlReasoningStartTime = Date.now();
            if (textBefore.length > 0) {
              answerText += textBefore;
              if (!currentTextItem) {
                currentTextItem = { text: { content: '' } };
                assistantResponses.push(currentTextItem);
              }
              currentTextItem.text!.content += textBefore;
              workflowStreamResponse?.({
                event: SseResponseEventEnum.answer,
                data: textAdaptGptResponse({ text: textBefore })
              });
            }
            // Reset text item so text after </think> starts fresh
            currentTextItem = null;
          }
        }
      }
    };

    agent.subscribe((event: AgentEvent) => {
      if (event.type === 'message_update') {
        const e = event.assistantMessageEvent;
        if (e.type === 'text_delta') {
          processTextChunk(e.delta);
        } else if (e.type === 'thinking_delta') {
          // Send reasoning/thinking content as reasoning_content in answer events
          if (!aiChatReasoning) return;
          if (!currentReasoningItem) {
            currentReasoningItem = { reasoning: { content: '' } };
            assistantResponses.push(currentReasoningItem);
            deltaReasoningStartTime = Date.now();
          }
          currentReasoningItem.reasoning!.content += e.delta;
          // Also accumulate in answerText for backward compatibility with API
          // consumers (e.g. step calls in master/call.ts) that read answerText
          // directly rather than reconstructing it from assistantResponses.
          answerText += e.delta;
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({ reasoning_content: e.delta })
          });
        }
      } else if (event.type === 'turn_end') {
        // Reset text item tracker at turn boundary; next text_delta starts a new item.
        // Tool items have already been pushed to assistantResponses by buildAgentTools
        // during tool execution between turns, so they appear in the correct position.
        currentTextItem = null;
        // Close reasoning item with duration if one is active.
        // Use whichever timer was set — the two reasoning paths are mutually
        // exclusive within a single turn, so at most one timer is non-null.
        if (currentReasoningItem) {
          const timer = deltaReasoningStartTime ?? xmlReasoningStartTime;
          if (timer) {
            currentReasoningItem.reasoning!.duration = Math.round((Date.now() - timer) / 1000) || 1;
          }
        }
        deltaReasoningStartTime = null;
        xmlReasoningStartTime = null;
        currentReasoningItem = null;
        // Drain residual thinkTagBuffer at turn boundary.
        // Two cases:
        // - !inThinkTag: partial <think> tag prefix in buffer → flush as text
        // - inThinkTag: reasoning content without closing </think> → flush as reasoning
        if (thinkTagBuffer.length > 0) {
          if (inThinkTag) {
            // Buffer has reasoning content whose closing </think> tag never arrived
            if (aiChatReasoning) {
              if (!currentReasoningItem) {
                currentReasoningItem = { reasoning: { content: '' } };
                assistantResponses.push(currentReasoningItem);
              }
              currentReasoningItem.reasoning!.content += thinkTagBuffer;
              answerText += thinkTagBuffer;
              workflowStreamResponse?.({
                event: SseResponseEventEnum.answer,
                data: textAdaptGptResponse({ reasoning_content: thinkTagBuffer })
              });
            }
          } else {
            answerText += thinkTagBuffer;
            if (!currentTextItem) {
              currentTextItem = { text: { content: '' } };
              assistantResponses.push(currentTextItem);
            }
            currentTextItem.text!.content += thinkTagBuffer;
            workflowStreamResponse?.({
              event: SseResponseEventEnum.answer,
              data: textAdaptGptResponse({ text: thinkTagBuffer })
            });
          }
        }
        thinkTagBuffer = '';
        inThinkTag = false;
        const errMsg = (event.message as any).errorMessage as string | undefined;
        if (errMsg) {
          getLogger(LogCategories.MODULE.AI.AGENT).error(`[piAgent] Turn error: ${errMsg}`);
        }
      }
      // SSE toolCall / toolResponse events are emitted inside each tool's execute()
      // wrapper in toolAdapter.ts
    });

    // Poll for user-initiated stop
    const stopPoller = setInterval(() => {
      if (checkIsStopping()) {
        agent.abort();
        clearInterval(stopPoller);
      }
    }, 200);

    getLogger(LogCategories.MODULE.AI.AGENT).debug(`[piAgent] Starting agent prompt`);
    await agent.prompt(formatUserChatInput);
    clearInterval(stopPoller);
    getLogger(LogCategories.MODULE.AI.AGENT).debug(`[piAgent] Agent completed`);

    // Record LLM usage from pi-agent-core assistant messages.
    // pi-agent-core manages the LLM loop internally, so we extract token usage
    // from AssistantMessage objects stored in agent.state.messages after completion.
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const msg of agent.state.messages) {
      if (msg.role === 'assistant' && 'usage' in msg) {
        const assistantMsg = msg as import('@mariozechner/pi-ai').AssistantMessage;
        if (
          assistantMsg.stopReason !== 'error' &&
          assistantMsg.stopReason !== 'aborted' &&
          assistantMsg.usage
        ) {
          totalInputTokens += assistantMsg.usage.input;
          totalOutputTokens += assistantMsg.usage.output;
        }
      }
    }

    const modelData = getLLMModelById(modelId);

    if ((totalInputTokens > 0 || totalOutputTokens > 0) && usagePush) {
      const totalPoints = props.externalProvider?.openaiAccount?.key
        ? 0
        : formatModelChars2Points({
            modelId,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens
          }).totalPoints;

      usagePush([
        {
          moduleName: i18nT('account_usage:agent_call'),
          modelId: modelData?.id,
          totalPoints,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens
        }
      ]);
    }

    // Surface API errors that pi-agent-core stores instead of throwing
    if (agent.state.errorMessage) {
      throw new Error(agent.state.errorMessage);
    }

    // Build agent nodeResponse with textOutput and historyPreview
    // Extract token usage from agent state messages, aligned with usagePush filtering.
    // pi-agent-core AssistantMessage stores tokens in msg.usage.input / msg.usage.output.
    let inputTokens = 0;
    let outputTokens = 0;
    const messageList = agent.state.messages as any[];
    for (const msg of messageList) {
      if (msg.role === 'assistant' && 'usage' in msg) {
        const assistantMsg = msg as import('@mariozechner/pi-ai').AssistantMessage;
        if (
          assistantMsg.stopReason !== 'error' &&
          assistantMsg.stopReason !== 'aborted' &&
          assistantMsg.usage
        ) {
          inputTokens += assistantMsg.usage.input;
          outputTokens += assistantMsg.usage.output;
        }
      }
    }

    // Build history preview from agent state messages
    const chatCompleteMessages = GPTMessages2Chats({
      messages: messageList.map((msg: any) => ({
        role: msg.role || 'assistant',
        content: msg.content || ''
      }))
    });
    const historyPreview = getHistoryPreview(chatCompleteMessages, 10000, true);

    const agentNodeResponse: ChatHistoryItemResType = {
      nodeId: getNanoid(6),
      id: getNanoid(6),
      moduleType: FlowNodeTypeEnum.agent,
      moduleName: i18nT('chat:master_agent_call'),
      modelId: modelId,
      moduleLogo: 'core/app/type/agentFill',
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      // Master agent's own LLM points; children's totalPoints are carried in
      // childrenResponses and aggregated after flattenNodeResponses in getChatDataLog.
      totalPoints: modelData
        ? formatModelChars2Points({
            modelId,
            inputTokens,
            outputTokens
          }).totalPoints
        : 0,
      childrenResponses: nodeResponses.length > 0 ? [...nodeResponses] : undefined,
      textOutput: answerText || undefined,
      historyPreview,
      runningTime: +((Date.now() - startTime) / 1000).toFixed(2)
    };

    // Push the agent nodeResponse as the only top-level response
    nodeResponses.length = 0;
    nodeResponses.push(agentNodeResponse);

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: answerText
      },
      [DispatchNodeResponseKeyEnum.memories]: {
        [piMessagesKey]: agent.state.messages
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
    };
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.AGENT).error(`[piAgent] dispatchPiAgent error`, { error });
    return getNodeErrResponse({ error });
  } finally {
    for (const cap of capabilities) {
      await cap.dispose?.();
    }
  }
};
