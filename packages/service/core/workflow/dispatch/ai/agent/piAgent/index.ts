import { getErrText } from '@fastgpt/global/common/error/utils';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { normalizeSkillIds } from '@fastgpt/global/core/app/formEdit/type';
import { getSystemToolInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { Agent, type AgentEvent, type AgentMessage } from '@mariozechner/pi-agent-core';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { serviceEnv } from '../../../../../../env';
import type { DispatchAgentModuleProps } from '..';
import { parseUserSystemPrompt } from '../adapter/prompt';
import { createCapabilityToolCallHandler, type AgentCapability } from '../capability/type';
import { createSandboxSkillsCapability } from '../capability/sandboxSkills';
import { formatFileInput } from '../sub/file/utils';
import { getHistories } from '../../../utils';
import { getSubapps, type ToolDispatchContext } from '../utils';
import {
  createPiAgentWorkflowRuntime,
  normalizePiAgentMessages,
  type PiAgentWorkflowRuntimeArtifacts
} from './adapter/runtime';
import { filterFailedAgentNodeResponses } from '../adapter/nodeResponses';
import { buildPiModel, getModelApiKey, getPiThinkingLevel } from './modelBridge';
import { buildAgentTools, createPiAgentToolEventHandler } from './toolAdapter';

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchPiAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  const {
    checkIsStopping,
    node: { nodeId, inputs },
    lang,
    histories,
    requestOrigin,
    chatConfig,
    runningAppInfo,
    workflowStreamResponse,
    usagePush,
    mode,
    chatId,
    showSkillReferences,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinksInput,
      agent_selectedTools: selectedTools = [],
      skills: skillIds = [],
      useEditDebugSandbox,
      agent_datasetParams: datasetParams,
      useAgentSandbox = false,
      aiChatVision,
      aiChatReasoning,
      aiChatReasoningEffort
    }
  } = props;

  const piMessagesKey = `piMessages-${nodeId}`;
  const chatHistories = getHistories(history, histories);
  const normalizedSkillIds = normalizeSkillIds(skillIds);

  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];
  const capabilities: AgentCapability[] = [];
  let agent: InstanceType<typeof Agent> | undefined;
  let piRuntime: PiAgentWorkflowRuntimeArtifacts | undefined;
  let stopPoller: ReturnType<typeof setInterval> | undefined;

  const appendFinalAssistantResponses = () => {
    const reasoningText = piRuntime?.getReasoningText() || '';
    const answerText = piRuntime?.getAnswerText() || '';
    const showReasoning = aiChatReasoning !== false;

    if (reasoningText) {
      assistantResponses.push({
        reasoning: {
          content: reasoningText
        },
        ...(!showReasoning ? { hideInUI: true } : {})
      });
    }

    if (answerText) {
      assistantResponses.push({
        text: {
          content: answerText
        }
      });
    }

    return answerText;
  };

  try {
    // 1. 准备用户输入与文件上下文。PiAgent 自己维护 messages，这里只负责把本轮输入整理成 prompt。
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

    const formatUserChatInput = fileInputPrompt
      ? `${fileInputPrompt}\n\n${userChatInput}`
      : userChatInput;

    // 2. 初始化独立能力。技能能力只贡献 system prompt / tools / assistantResponses，不直接参与 PiAgent loop 状态。
    if (serviceEnv.SHOW_SKILL) {
      const sandboxSessionId = mode === 'chat' ? chatId : `debug-${runningAppInfo.id}-${nodeId}`;
      const sandboxMode = useEditDebugSandbox ? 'editDebug' : 'sessionRuntime';

      const sandboxCap = await createSandboxSkillsCapability({
        skillIds: normalizedSkillIds,
        teamId: runningAppInfo.teamId,
        tmbId: runningAppInfo.tmbId,
        sessionId: sandboxSessionId,
        mode: sandboxMode,
        workflowStreamResponse,
        showSkillReferences: showSkillReferences === true,
        allFilesMap
      });
      capabilities.push(sandboxCap);
    }

    const capabilitySystemPrompt = capabilities
      .map((item) => item.systemPrompt)
      .filter(Boolean)
      .join('\n\n');
    const capabilityTools = capabilities.flatMap((item) => item.completionTools ?? []);
    const capabilityToolCallHandler =
      capabilities.length > 0 ? createCapabilityToolCallHandler(capabilities) : undefined;

    // 3. 收集 workflow 可用工具。PiAgent 工具执行仍复用现有 workflow 子工具调度器。
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
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

      const systemToolNode = getSystemToolInfo(id, lang) || getSystemToolInfo(formatId, lang);
      return {
        name: systemToolNode?.name || '',
        avatar: systemToolNode?.avatar || '',
        toolDescription: systemToolNode?.toolDescription || systemToolNode?.name || ''
      };
    };
    const getSubApp = (id: string) => {
      const formatId = id.startsWith('t') ? id.slice(1) : id;
      return agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId);
    };

    // 4. 拼接 PiAgent 的 system prompt。这里补齐 workflow 专属约束、capability prompt 和 sandbox prompt。
    const sandboxSystemPrompt =
      useAgentSandbox && !!global.feConfigs?.show_agent_sandbox ? SANDBOX_SYSTEM_PROMPT : '';
    const formatedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: [systemPrompt || '', capabilitySystemPrompt, sandboxSystemPrompt]
        .filter(Boolean)
        .join('\n\n'),
      selectedDataset: datasetParams?.datasets
    });

    // 5. 创建 workflow runtime adapter。它负责主模型 requestId、usage、nodeResponses、SSE 与 request record。
    piRuntime = createPiAgentWorkflowRuntime({
      props,
      nodeResponses,
      workflowStreamResponse,
      usagePush,
      completionTools: agentCompletionTools
    });

    const piModel = buildPiModel(model, aiChatVision, props.externalProvider.openaiAccount);
    const thinkingLevel = getPiThinkingLevel(model, aiChatReasoningEffort);
    const apiKey = getModelApiKey(model, props.externalProvider.openaiAccount);

    const toolCtx: ToolDispatchContext = {
      ...props,
      streamResponseFn: workflowStreamResponse,
      getSubAppInfo,
      getSubApp,
      completionTools: agentCompletionTools,
      filesMap,
      capabilityToolCallHandler
    };

    const piTools = await buildAgentTools({
      ctx: toolCtx,
      assistantResponses,
      appendChildNodeResponse: piRuntime.appendChildNodeResponse,
      usagePush
    });
    const handlePiToolEvent = createPiAgentToolEventHandler({
      ctx: toolCtx,
      assistantResponses,
      appendChildNodeResponse: piRuntime.appendChildNodeResponse,
      nodeResponses
    });

    // 6. 恢复上一轮 PiAgent messages。只从当前节点 memory 恢复，保持 PiAgent 独立 loop 的连续性。
    const lastHistory = chatHistories[chatHistories.length - 1];
    const restoredMessages =
      lastHistory?.obj === ChatRoleEnum.AI
        ? ((lastHistory.memories?.[piMessagesKey] as AgentMessage[] | undefined) ?? [])
        : [];
    const normalizedRestoredMessages = normalizePiAgentMessages({
      messages: restoredMessages,
      completionTools: agentCompletionTools
    });

    agent = new Agent({
      initialState: {
        systemPrompt: formatedSystemPrompt,
        model: piModel,
        thinkingLevel,
        tools: piTools,
        messages: normalizedRestoredMessages
      },
      getApiKey: () => apiKey,
      onPayload: piRuntime.onPayload,
      transformContext: async (messages) =>
        normalizePiAgentMessages({
          messages,
          completionTools: agentCompletionTools
        })
    });

    agent.subscribe((event: AgentEvent) => {
      piRuntime?.handleAgentEvent(event);
      handlePiToolEvent(event);

      if (event.type === 'turn_end') {
        const errMsg = (event.message as { errorMessage?: string }).errorMessage;
        if (errMsg) {
          getLogger(LogCategories.MODULE.AI.AGENT).error(`[piAgent] Turn error: ${errMsg}`);
        }
      }
    });

    stopPoller = setInterval(() => {
      if (checkIsStopping()) {
        agent?.abort();
        if (stopPoller) clearInterval(stopPoller);
      }
    }, 200);

    getLogger(LogCategories.MODULE.AI.AGENT).debug(`[piAgent] Starting agent prompt`);
    await agent.prompt(formatUserChatInput);
    getLogger(LogCategories.MODULE.AI.AGENT).debug(`[piAgent] Agent completed`);

    if (agent.state.errorMessage) {
      throw new Error(agent.state.errorMessage);
    }

    const answerText = appendFinalAssistantResponses();

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

    const answerText = appendFinalAssistantResponses();
    const errorText = getErrText(error);
    piRuntime?.appendPendingAgentError(errorText);
    const memories = agent
      ? {
          [piMessagesKey]: agent.state.messages
        }
      : undefined;

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: answerText
      },
      error: {
        [NodeOutputKeyEnum.errorText]: errorText
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: {
        error: errorText
      },
      ...(memories
        ? {
            [DispatchNodeResponseKeyEnum.memories]: memories
          }
        : {}),
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: filterFailedAgentNodeResponses(nodeResponses)
    };
  } finally {
    if (stopPoller) clearInterval(stopPoller);
    for (const cap of capabilities) {
      await cap.dispose?.();
    }
  }
};
