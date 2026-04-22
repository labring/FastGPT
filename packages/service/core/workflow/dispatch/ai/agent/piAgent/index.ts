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
import { parseUserSystemPrompt } from '../sub/plan/prompt';
import { formatFileInput } from '../sub/file/utils';
import { normalizeSkillIds } from '@fastgpt/global/core/app/formEdit/type';
import { systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { ToolDispatchContext } from '../utils';
import { getSubapps } from '../utils';
import { createCapabilityToolCallHandler, type AgentCapability } from '../capability/type';
import { createSandboxSkillsCapability } from '../capability/sandboxSkills';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { buildPiModel, getModelApiKey } from './modelBridge';
import { buildAgentTools } from './toolAdapter';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { env } from '../../../../../../env';
import type { DispatchAgentModuleProps } from '..';

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
      aiChatVision
    }
  } = props;

  const chatHistories = getHistories(history, histories);
  const normalizedSkillIds = normalizeSkillIds(skillIds);

  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];
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

    const formatUserChatInput = fileInputPrompt
      ? `${fileInputPrompt}\n\n${userChatInput}`
      : userChatInput;

    // Initialize capabilities — sandbox skills (lazy-init, gated by SHOW_SKILL)
    if (env.SHOW_SKILL) {
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

    // Aggregate capability contributions
    const capabilitySystemPrompt = capabilities
      .map((c) => c.systemPrompt)
      .filter(Boolean)
      .join('\n\n');
    const capabilityTools = capabilities.flatMap((c) => c.completionTools ?? []);
    const capabilityToolCallHandler =
      capabilities.length > 0 ? createCapabilityToolCallHandler(capabilities) : undefined;

    // Get sub apps — pi-agent-core manages reasoning, no plan tool needed
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

    const formatedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: capabilitySystemPrompt
        ? `${systemPrompt || ''}\n\n${capabilitySystemPrompt}`.trim()
        : systemPrompt,
      selectedDataset: datasetParams?.datasets
    });

    /* ===== Build pi-agent-core model & tools ===== */
    const piModel = buildPiModel(model, aiChatVision);
    const apiKey = getModelApiKey(model);

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
      nodeResponses,
      usagePush
    });

    /* ===== Restore session messages from last AI history ===== */
    const piMessagesKey = `piMessages-${nodeId}`;
    const lastHistory = chatHistories[chatHistories.length - 1];
    const restoredMessages =
      lastHistory?.obj === ChatRoleEnum.AI
        ? (lastHistory.memories?.[piMessagesKey] as any[] | undefined) ?? []
        : [];

    /* ===== Create & run Agent ===== */
    const { Agent } = await import('@mariozechner/pi-agent-core');
    type AgentEvent = import('@mariozechner/pi-agent-core').AgentEvent;

    const agent = new Agent({
      initialState: {
        systemPrompt: formatedSystemPrompt,
        model: piModel,
        tools: piTools,
        messages: restoredMessages
      },
      getApiKey: () => apiKey
    });

    // Collect text deltas to build answerText
    let answerText = '';

    agent.subscribe((event: AgentEvent) => {
      if (event.type === 'message_update') {
        const e = event.assistantMessageEvent;
        if (e.type === 'text_delta') {
          answerText += e.delta;
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({ text: e.delta })
          });
        }
      } else if (event.type === 'turn_end') {
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

    // Surface API errors that pi-agent-core stores instead of throwing
    if (agent.state.errorMessage) {
      throw new Error(agent.state.errorMessage);
    }

    // Build assistant responses
    if (answerText) {
      assistantResponses.push({ text: { content: answerText } });
    }

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
