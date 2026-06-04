import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemMiniType
} from '@fastgpt/global/core/chat/type';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getSubapps } from './sub/utils';
import { parseUserSystemPrompt } from './adapter/prompt';
import { useUserContext } from './adapter/userContext';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getLLMModel } from '../../../../ai/model';
import { runAgentLoop } from '../../../../ai/llm/agentLoop';
import {
  buildWorkflowAgentLoopMemories,
  createWorkflowAgentLoopRuntime,
  getWorkflowAgentLoopMemoryKeys,
  readWorkflowAgentLoopMemory
} from './adapter';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useSandbox } from './sub/sandbox/useSandbox';
import {
  appendAskIdToAssistantResponses,
  appendFinalAssistantResponse,
  appendResultAssistantResponses,
  buildAgentLoopAskMemories,
  buildAgentLoopDoneMemories,
  createAgentSubAppLookup,
  createAskInteractive,
  getAskInteractiveAskId,
  getPersistedTextOutput,
  getWorkflowAgentLoopProvider,
  prepareAgentLoopProviderRunState
} from './utils';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemMiniType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatAudio]?: boolean;
  [NodeInputKeyEnum.aiChatVideo]?: boolean;
  [NodeInputKeyEnum.aiChatExtractFiles]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffort;
  [NodeInputKeyEnum.aiChatTemperature]?: number;
  [NodeInputKeyEnum.aiChatMaxToken]?: number;
  [NodeInputKeyEnum.aiChatTopP]?: number;
  [NodeInputKeyEnum.aiChatStopSign]?: string;
  [NodeInputKeyEnum.aiChatResponseFormat]?: string;
  [NodeInputKeyEnum.aiChatJsonSchema]?: string;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;

  [NodeInputKeyEnum.selectedTools]?: SkillToolType[];
  [NodeInputKeyEnum.skills]?: SelectedAgentSkillItemType[];
  [NodeInputKeyEnum.editSkillId]?: string;

  [NodeInputKeyEnum.datasetParams]?: AppFormEditFormType['dataset'];
  [NodeInputKeyEnum.useAgentSandbox]?: boolean;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

/**
 * Agent 节点入口。
 * 负责准备历史、文件、工具、能力插件和持久化 memory，然后把实际循环执行交给统一 agentLoop 入口。
 */
export const dispatchRunAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  // 这些数组会贯穿整轮 dispatch，并由 adapter 持续写入。
  // 最终统一作为 workflow 节点的 assistantResponses 和 nodeResponses 返回。
  const assistantResponses: AIChatItemValueItemType[] = [];
  const childNodeResponses: ChatHistoryItemResType[] = [];

  const {
    node: { nodeId, inputs },
    lang,
    histories,
    query,
    requestOrigin,
    chatConfig,
    lastInteractive,
    runningAppInfo,
    runningUserInfo,
    workflowStreamResponse,
    usagePush,
    chatId,
    uid,
    responseChatItemId,
    timezone,
    params: {
      systemPrompt,
      userChatInput,
      history = 6,
      agent_selectedTools: selectedTools = [],
      skills: selectedSkills = [],
      editSkillId,
      agent_datasetParams: datasetParams,
      useAgentSandbox = false,
      model,
      aiChatReasoning
    }
  } = props;
  const agentModel = getLLMModel(model);
  props.params.aiChatVision = !!(props.params.aiChatVision && agentModel.vision);
  props.params.aiChatAudio = !!(props.params.aiChatAudio && agentModel.audio);
  props.params.aiChatVideo = !!(props.params.aiChatVideo && agentModel.video);
  if (props.params.aiChatExtractFiles !== undefined) {
    props.params.aiChatExtractFiles = !!(
      props.params.aiChatExtractFiles &&
      (props.params.aiChatVision || props.params.aiChatAudio || props.params.aiChatVideo)
    );
  }

  const skillIds = editSkillId ? [editSkillId] : selectedSkills.map(({ skillId }) => skillId);

  // 初始化对话框输入的文件
  const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
  const fileLinks =
    fileUrlInput && fileUrlInput.value && fileUrlInput.value.length > 0
      ? props.params.fileUrlList
      : undefined;

  try {
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

    // 初始化 sandbox：初始化、注入 skills、files
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
    // 获取请求上下文
    const { chatHistories, queryInput, filesMap } = userContext;
    const { rewrittenHistories, currentUserMessage } = userContext.getCurrentMessages({
      skillInfos,
      currentWorkingDirectory
    });

    // 转化成请求的 messages
    const requestMessages = [...rewrittenHistories, currentUserMessage];
    const historiesMessages = chats2GPTMessages({
      messages: requestMessages,
      reserveId: false,
      reserveTool: true
    });
    // system message 由 getMainAgentSystemPrompt 统一注入；历史里的 system 只作为外部噪音过滤掉。
    const loopMessages = historiesMessages.filter((message) => message.role !== 'system');
    // 用户配置 prompt 和 sandbox prompt 作为 Main Agent 的 system 背景输入。
    const formatedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: [systemPrompt, sandboxClient ? SANDBOX_SYSTEM_PROMPT : '']
        .filter(Boolean)
        .join('\n\n')
    });

    // 汇总用户选择工具和知识库 runtime tool。
    // plan/ask/sandbox/readFile 由 agentLoop provider 根据 systemTools 注入，不混入业务 completionTools。
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
        hasDataset: datasetParams && datasetParams.datasets.length > 0
      }
    );
    const { getSubAppInfo, getSubApp } = createAgentSubAppLookup({
      subAppsMap: agentSubAppsMap,
      lang
    });

    // 2. 创建 workflow adapter。
    // 通用 agent loop 不感知 workflow；工具执行、SSE、usage、nodeResponse 都通过 runtime 参数回调进来。
    const { runtime } = createWorkflowAgentLoopRuntime({
      context: {
        ...props,
        systemPrompt: formatedSystemPrompt,
        getSubAppInfo,
        getSubApp,
        completionTools: agentCompletionTools,
        filesMap,
        sandboxClient,
        streamResponseFn: workflowStreamResponse
      },
      usagePush,
      workflowStreamResponse,
      assistantResponses,
      nodeResponses: childNodeResponses
    });

    // providerState 统一保存 provider 内部恢复信息。
    // fastAgent 的 ask_user 会在其中保存 pendingMainContext，用户回答后恢复同一条 messages。
    const restoredMemory = readWorkflowAgentLoopMemory({
      histories: chatHistories,
      nodeId
    });
    const provider = getWorkflowAgentLoopProvider();
    const {
      piMessagesKey,
      providerState: runtimeProviderState,
      isAskResume
    } = prepareAgentLoopProviderRunState({
      provider,
      restoredProviderState: restoredMemory.providerState,
      histories,
      nodeId,
      hasLastInteractive: !!lastInteractive
    });
    // 3. 运行单主 loop。
    // 如果上一轮因 ask_user 暂停，这里会把用户回答作为 ask tool response 接回原 messages。
    const result = await runAgentLoop({
      provider,
      runtime,
      input: {
        messages: loopMessages,
        systemPrompt: formatedSystemPrompt,
        providerState: runtimeProviderState,
        userAnswer: isAskResume ? queryInput || userChatInput : undefined
      }
    });
    appendResultAssistantResponses({
      target: assistantResponses,
      values: result.assistantResponses
    });

    if (result.status === 'ask') {
      if (!result.ask) {
        throw new Error('Agent loop returned ask status without ask payload.');
      }

      // ask 状态不产出最终 answer，只返回 interactive + memory。
      // memory 会在用户下一次回复时恢复，保证上下文连续和缓存命中。
      // saveChat 会把该 askId 回写到用户答案上，后续 chats2GPTMessages 据此跳过这条 UI-only 回答。
      const askId =
        result.askId ||
        getAskInteractiveAskId({
          provider,
          providerState: result.providerState,
          nodeId,
          fallbackMemoryKey: getWorkflowAgentLoopMemoryKeys(nodeId).memoryKey
        });
      const interactive = createAskInteractive({
        askId,
        ask: result.ask
      });
      appendAskIdToAssistantResponses({
        assistantResponses,
        askId
      });

      return {
        [DispatchNodeResponseKeyEnum.nodeResponses]: childNodeResponses,
        [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
        [DispatchNodeResponseKeyEnum.memories]: buildAgentLoopAskMemories({
          provider,
          nodeId,
          providerState: result.providerState,
          piMessagesKey
        }),
        [DispatchNodeResponseKeyEnum.interactive]: interactive
      };
    }

    // 4. 结束态归一化。
    // done 正常落 answer；error/aborted 转成可见文本，同时保留 error 输出给 workflow。
    const errorText =
      result.status === 'error'
        ? getErrText(result.error)
        : result.status === 'aborted'
          ? i18nT('chat:completion_finish_error')
          : undefined;
    const finalText = result.answerText || errorText;
    appendFinalAssistantResponse({
      assistantResponses,
      finalText,
      reasoningText: result.reasoningText,
      hideReason: aiChatReasoning === false
    });

    // workflow 节点输出需要一个纯文本 answerText；前端展示则继续使用结构化 assistantResponses。
    const answerText = getPersistedTextOutput(assistantResponses);

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: answerText
      },
      ...(errorText && {
        error: {
          [NodeOutputKeyEnum.errorText]: errorText
        }
      }),
      [DispatchNodeResponseKeyEnum.memories]: buildAgentLoopDoneMemories({
        provider,
        nodeId,
        providerState: result.providerState,
        piMessagesKey
      }),
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: childNodeResponses
    };
  } catch (error) {
    // dispatch 层兜底：异常仍要清理 pending memory，并把已有 assistantResponses/nodeResponses 返回给前端恢复。
    getLogger(LogCategories.MODULE.AI.AGENT).error(`[Agent] dispatchRunAgent caught error`, {
      error
    });
    const errorText = getErrText(error);
    return {
      error: {
        [NodeOutputKeyEnum.errorText]: errorText
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: {
        error: errorText
      },
      [DispatchNodeResponseKeyEnum.memories]: buildWorkflowAgentLoopMemories({
        nodeId,
        memory: {}
      }),
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: childNodeResponses
    };
  }
};
