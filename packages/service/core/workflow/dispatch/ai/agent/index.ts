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
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getAgentDatasetParams, getSubapps } from './sub/utils';
import { useUserContext } from './adapter/userContext';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getLLMModel } from '../../../../ai/model';
import { createWorkflowAgentLoopRuntime } from './adapter/runtime';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createAgentSubAppLookup, getWorkflowAgentLoopProvider } from './utils';
import {
  ensureAgentSandboxRuntime,
  streamAgentSandboxInitStatus,
  type AgentSandboxPrepareAction
} from './sub/sandbox';
import type { WorkflowNodeResponseWriter } from '../../../../chat/nodeResponseStorage';
import type { RuntimeNodeResponseSummary } from '../../type';
import { createAgentNodeResponseCollector } from './nodeResponseCollector';
import { createAgentSandboxPermissionDeniedError } from '../../../../ai/sandbox/interface/runtime';
import { replaceAgentPromptToolReferences } from './adapter/prompt';
import {
  buildAgentLoopCoreInput,
  buildAgentLoopCorePausedMemories,
  buildAgentLoopCoreDoneMemories,
  buildAgentLoopCoreFinalAssistantOutput,
  buildAgentLoopCoreProviderStateMemories,
  buildAgentLoopCoreRequestMessages,
  buildAgentLoopCoreSystemPrompt,
  createAgentLoopCoreChildInteractiveParams,
  prepareAgentLoopCoreProviderRunState,
  readAgentLoopCoreProviderStateMemory,
  runAgentLoopCoreWithSummary
} from '../agentLoopCore/interface';

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
  [NodeInputKeyEnum.datasetSelectList]?: AppFormEditFormType['dataset']['datasets'];
  [NodeInputKeyEnum.datasetSimilarity]?: number;
  [NodeInputKeyEnum.datasetMaxTokens]?: number;
  [NodeInputKeyEnum.datasetSearchMode]?: AppFormEditFormType['dataset']['searchMode'];
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;
  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  [NodeInputKeyEnum.authTmbId]?: boolean;
  [NodeInputKeyEnum.useAgentSandbox]?: boolean;
  [NodeInputKeyEnum.sandboxEntrypoint]?: string;
}> & {
  nodeResponseWriter?: WorkflowNodeResponseWriter;
  agentSandboxPrepareActions?: AgentSandboxPrepareAction[];
};

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}> & {
  runtimeNodeResponseSummary?: RuntimeNodeResponseSummary;
};

/**
 * Agent 节点入口。
 * 负责准备历史、文件、工具、能力插件和持久化 memory，然后把实际循环执行交给统一 agentLoop 入口。
 */
export const dispatchRunAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  // 这些数组会贯穿整轮 dispatch，并由 adapter 持续写入。
  // 最终统一作为 workflow 节点的 assistantResponses 和 nodeResponses 返回。
  const assistantResponses: AIChatItemValueItemType[] = [];
  const childNodeResponses: ChatHistoryItemResType[] = [];
  const nodeResponseCollector = createAgentNodeResponseCollector({
    nodeResponseWriter: props.nodeResponseWriter,
    nodeResponseParentId: undefined,
    nodeResponses: childNodeResponses
  });

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
    agentSandboxPrepareActions,
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
      useAgentSandbox = false,
      sandboxEntrypoint,
      model,
      aiChatReasoning
    }
  } = props;
  const datasetParams = getAgentDatasetParams(props.params);
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
  const hasSandboxRuntimeDependency = !!editSkillId || skillIds.length > 0;
  const effectiveUseAgentSandbox =
    hasSandboxRuntimeDependency || (!!useAgentSandbox && !!global.feConfigs?.show_agent_sandbox);
  const effectiveSandboxEntrypoint =
    effectiveUseAgentSandbox && useAgentSandbox && global.feConfigs?.show_agent_sandbox
      ? sandboxEntrypoint
      : undefined;
  const skipSandboxInputFiles = runningAppInfo.sourceType === ChatSourceTypeEnum.skillEdit;

  // 初始化对话框输入的文件
  const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
  const fileLinks =
    fileUrlInput && fileUrlInput.value && fileUrlInput.value.length > 0
      ? props.params.fileUrlList
      : undefined;

  try {
    if (hasSandboxRuntimeDependency && !global.feConfigs?.show_agent_sandbox) {
      throw createAgentSandboxPermissionDeniedError();
    }

    const userContext = await useUserContext({
      history,
      histories,
      currentFiles: fileLinks,
      currentUserInput: userChatInput,
      currentQuery: query,
      currentDataId: responseChatItemId,
      selectedDataset: datasetParams?.datasets,
      authTmbId: datasetParams?.authTmbId,
      tmbId: runningUserInfo.tmbId,
      timezone,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20
    });

    if (effectiveUseAgentSandbox) {
      streamAgentSandboxInitStatus({
        workflowStreamResponse,
        sourceType: runningAppInfo.sourceType,
        sourceId: runningAppInfo.sourceId,
        userId: uid,
        chatId
      });
    }

    // 初始化 sandbox：初始化、注入 skills、files
    const { sandboxClient, currentWorkingDirectory, skillInfos } = await ensureAgentSandboxRuntime({
      sourceType: runningAppInfo.sourceType,
      sourceId: runningAppInfo.sourceId,
      userId: uid,
      chatId,
      teamId: runningAppInfo.teamId,
      tmbId: runningUserInfo.tmbId,
      needSandboxRuntime: effectiveUseAgentSandbox,
      sandboxEntrypoint: effectiveSandboxEntrypoint,
      skillIds,
      selectedSkills,
      editSkillId,
      prepareActions: agentSandboxPrepareActions,
      currentFiles: skipSandboxInputFiles ? [] : userContext.currentFiles
    });
    // 获取请求上下文
    const { chatHistories, queryInput, fileUrlMap, filesMap } = userContext;
    const { rewrittenHistories, currentUserMessage } = userContext.getCurrentMessages({
      skillInfos,
      currentWorkingDirectory
    });

    // 转化成请求的 messages
    const requestMessages = [...rewrittenHistories, currentUserMessage];
    const loopMessages = buildAgentLoopCoreRequestMessages({
      messages: requestMessages,
      removeSystemMessages: true
    });
    // 汇总用户选择工具和知识库 runtime tool。
    // plan/ask/sandbox/readFile 由 agentLoop provider 根据 systemTools 注入，不混入业务 completionTools。
    const {
      completionTools: agentCompletionTools,
      subAppsMap: agentSubAppsMap,
      promptToolReferenceInfoMap
    } = await getSubapps({
      tools: selectedTools,
      tmbId: runningAppInfo.tmbId,
      lang
    });
    const { getSubAppInfo, getSubApp } = createAgentSubAppLookup({
      subAppsMap: agentSubAppsMap,
      lang
    });
    // system message 由 getMainAgentSystemPrompt 统一注入；历史里的 system 只作为外部噪音过滤掉。
    // PromptEditor 保存的是工具 ID，进入主 Agent 前转换为具体名称，避免模型看到不可调用的 ID。
    const formatedSystemPrompt = buildAgentLoopCoreSystemPrompt({
      userSystemPrompt: replaceAgentPromptToolReferences({
        text: systemPrompt,
        resolveName: (id) =>
          promptToolReferenceInfoMap.get(id) || getSubAppInfo(id).name || undefined
      }),
      runtimePrompts: sandboxClient ? [SANDBOX_SYSTEM_PROMPT] : []
    });

    // 2. 创建 workflow adapter。
    // 通用 agent loop 不感知 workflow；工具执行、SSE、usage、nodeResponse 都通过 runtime 参数回调进来。
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: {
        ...props,
        systemPrompt: formatedSystemPrompt,
        getSubAppInfo,
        getSubApp,
        completionTools: agentCompletionTools,
        fileUrlMap,
        filesMap,
        currentFiles: userContext.currentFiles,
        sandboxClient,
        streamResponseFn: workflowStreamResponse
      },
      usagePush,
      workflowStreamResponse,
      assistantResponses,
      nodeResponses: childNodeResponses,
      appendNodeResponse: nodeResponseCollector.appendNodeResponse
    });

    // providerState 统一保存 provider 内部恢复信息。
    // fastAgent 的 ask_user 会在其中保存 pendingMainContext，用户回答后恢复同一条 messages。
    const restoredMemory = readAgentLoopCoreProviderStateMemory({
      histories: chatHistories,
      nodeId
    });
    const provider = getWorkflowAgentLoopProvider();
    const {
      piMessagesKey,
      providerState: runtimeProviderState,
      isAskResume
    } = prepareAgentLoopCoreProviderRunState({
      provider,
      restoredProviderState: restoredMemory.providerState,
      histories,
      nodeId,
      hasLastInteractive: !!lastInteractive
    });
    // 3. 运行单主 loop。
    // 如果上一轮因 ask_user 暂停，这里会把用户回答作为 ask tool response 接回原 messages。
    const { summary: outputSummary } = await runAgentLoopCoreWithSummary({
      provider,
      runtime,
      input: buildAgentLoopCoreInput({
        messages: loopMessages,
        systemPrompt: formatedSystemPrompt,
        providerState: runtimeProviderState,
        userAnswer: isAskResume ? queryInput || userChatInput : undefined,
        childrenInteractiveParams: createAgentLoopCoreChildInteractiveParams({
          lastInteractive
        })
      }),
      assistantResponses: {
        // Workflow Agent 的文本、普通工具和 plan/ask 元事件由 core 按事件统一维护。
        eventTarget: assistantResponses,
        showReasoning: aiChatReasoning !== false,
        getEventToolInfo: (name) => {
          const subApp = getSubAppInfo(name);
          return {
            name: subApp.name || name,
            avatar: subApp.avatar
          };
        },
        metaEventNames: {
          updatePlanToolName: artifacts.updatePlanToolName,
          askToolName: artifacts.askToolName
        }
      }
    });
    const outputAssistantResponses = outputSummary.assistantResponses;

    if (
      outputSummary.status === 'interactive' &&
      outputSummary.interactive?.type === 'agentPlanAskQuery'
    ) {
      // ask 暂停不产出最终 answer，只返回 interactive + memory。
      // memory 会在用户下一次回复时恢复，保证上下文连续和缓存命中。
      // saveChat 会把该 askId 回写到用户答案上，后续 chats2GPTMessages 据此跳过这条 UI-only 回答。
      return {
        [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponseCollector.getNodeResponses(),
        runtimeNodeResponseSummary: nodeResponseCollector.getRuntimeNodeResponseSummary(),
        [DispatchNodeResponseKeyEnum.assistantResponses]: outputAssistantResponses,
        [DispatchNodeResponseKeyEnum.memories]: buildAgentLoopCorePausedMemories({
          nodeId,
          providerState: outputSummary.providerState
        }),
        [DispatchNodeResponseKeyEnum.interactive]: outputSummary.interactive
      };
    }

    if (outputSummary.status === 'interactive' && outputSummary.interactive) {
      return {
        [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponseCollector.getNodeResponses(),
        runtimeNodeResponseSummary: nodeResponseCollector.getRuntimeNodeResponseSummary(),
        [DispatchNodeResponseKeyEnum.assistantResponses]: outputAssistantResponses,
        [DispatchNodeResponseKeyEnum.memories]: buildAgentLoopCorePausedMemories({
          nodeId,
          providerState: outputSummary.providerState
        }),
        [DispatchNodeResponseKeyEnum.interactive]: outputSummary.interactive
      };
    }

    // 4. 结束态归一化。
    // done 正常落 answer；error/aborted 转成可见文本，同时保留 error 输出给 workflow。
    const finalOutput = buildAgentLoopCoreFinalAssistantOutput({
      assistantResponses: outputAssistantResponses,
      finalText: outputSummary.finalText,
      reasoningText: outputSummary.reasoningText,
      hideReason: aiChatReasoning === false
    });

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: finalOutput.answerText
      },
      ...(outputSummary.errorText && {
        error: {
          [NodeOutputKeyEnum.errorText]: outputSummary.errorText
        }
      }),
      [DispatchNodeResponseKeyEnum.memories]: buildAgentLoopCoreDoneMemories({
        provider,
        nodeId,
        piMessagesKey
      }),
      [DispatchNodeResponseKeyEnum.assistantResponses]: finalOutput.assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponseCollector.getNodeResponses(),
      runtimeNodeResponseSummary: nodeResponseCollector.getRuntimeNodeResponseSummary()
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
      [DispatchNodeResponseKeyEnum.toolResponse]: {
        error: errorText
      },
      [DispatchNodeResponseKeyEnum.memories]: buildAgentLoopCoreProviderStateMemories({
        nodeId,
        memory: {}
      }),
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponseCollector.getNodeResponses(),
      runtimeNodeResponseSummary: nodeResponseCollector.getRuntimeNodeResponseSummary()
    };
  } finally {
    await nodeResponseCollector.flush();
  }
};
