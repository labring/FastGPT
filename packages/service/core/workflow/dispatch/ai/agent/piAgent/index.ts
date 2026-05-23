import { getErrText } from '@fastgpt/global/common/error/utils';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getSystemToolInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { Agent, type AgentEvent, type AgentMessage } from '@mariozechner/pi-agent-core';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import type { DispatchAgentModuleProps } from '..';
import { parseUserSystemPrompt } from '../adapter/prompt';
import { useUserContext } from '../adapter/userContext';
import { useSandbox } from '../sub/sandbox';
import { getSubapps, type ToolDispatchContext } from '../utils';
import {
  createPiAgentWorkflowRuntime,
  normalizePiAgentMessages,
  type PiAgentWorkflowRuntimeArtifacts
} from './adapter/runtime';
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
    query,
    requestOrigin,
    chatConfig,
    runningAppInfo,
    runningUserInfo,
    workflowStreamResponse,
    usagePush,
    chatId,
    uid,
    responseChatItemId,
    timezone,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinksInput,
      agent_selectedTools: selectedTools = [],
      skills: selectedSkills = [],
      editSkillId,
      agent_datasetParams: datasetParams,
      useAgentSandbox = false,
      aiChatVision,
      aiChatReasoning,
      aiChatReasoningEffort
    }
  } = props;

  const piMessagesKey = `piMessages-${nodeId}`;

  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];
  let agent: InstanceType<typeof Agent> | undefined;
  let piRuntime: PiAgentWorkflowRuntimeArtifacts | undefined;
  let stopPoller: ReturnType<typeof setInterval> | undefined;

  const appendFinalAssistantResponses = () => {
    const reasoningText = piRuntime?.getReasoningText() || '';
    const answerText = piRuntime?.getAnswerText() || '';

    if (answerText) {
      assistantResponses.push({
        ...(reasoningText
          ? {
              reasoning: {
                content: reasoningText
              },
              ...(aiChatReasoning === false ? { hideReason: true } : {})
            }
          : {}),
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
    const skillIds = editSkillId ? [editSkillId] : selectedSkills.map(({ skillId }) => skillId);
    const userContext = await useUserContext({
      history,
      histories,
      currentFiles: fileLinks,
      currentUserInput: userChatInput,
      currentQuery: query,
      currentDataId: responseChatItemId,
      selectedDataset: datasetParams?.datasets,
      tmbId: runningUserInfo.tmbId,
      timezone,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20
    });
    const { sandboxClient, currentWorkingDirectory, skillInfos } = await useSandbox({
      appId: runningAppInfo.id,
      userId: uid,
      chatId,
      teamId: runningAppInfo.teamId,
      useAgentSandbox,
      skillIds,
      editSkillId,
      currentFiles: userContext.currentFiles
    });

    const { chatHistories, filesMap } = userContext;
    const { currentUserMessage } = userContext.getCurrentMessages({
      skillInfos,
      currentWorkingDirectory
    });
    const { text: formatUserChatInput } = chatValue2RuntimePrompt(currentUserMessage.value);

    // 2. 收集 workflow 可用工具。PiAgent 工具执行仍复用现有 workflow 子工具调度器。
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
        hasDataset: datasetParams && datasetParams.datasets.length > 0,
        hasFiles: !!chatConfig?.fileSelectConfig?.canSelectFile,
        useAgentSandbox: !!sandboxClient
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

    // 3. 拼接 PiAgent 的 system prompt。这里只补齐 workflow 专属约束和 sandbox prompt。
    const formatedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: [systemPrompt || '', sandboxClient ? SANDBOX_SYSTEM_PROMPT : '']
        .filter(Boolean)
        .join('\n\n')
    });

    // 4. 创建 workflow runtime adapter。它负责主模型 requestId、usage、nodeResponses、SSE 与 request record。
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
      sandboxClient,
      filesMap
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
      [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
    };
  } finally {
    if (stopPoller) clearInterval(stopPoller);
  }
};
