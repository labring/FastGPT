import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type {
  AppFormEditFormType,
  SelectedAgentSkillItemType
} from '@fastgpt/global/core/app/formEdit/type';
import type { AgentToolType } from '@fastgpt/global/core/app/tool/type';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemMiniType
} from '@fastgpt/global/core/chat/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getLogger, LogCategories } from '../../../../../common/logger';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../../types/runtime';
import { useUserContext } from './adapter/userContext';
import { getAgentDatasetParams, getSubapps, type RuntimePromptRefMeta } from './sub/utils';

import { buildDefaultAgentSystemPrompt } from '../../../../ai/llm/agentLoop/interface';
import {
  assertSandboxAvailable,
  resolveAppSandboxAvailability
} from '../../../../ai/sandbox/application/availability';
import { getWorkflowContext, getWorkflowSandboxContext, runWithContext } from '../../context';
import { loadWorkflowModelResource } from '../../../resource/service';
import { stripNodeSummaryErrorFields } from '../../utils/summary';
import { getNodeErrResponse, removeUnfinishedInteractiveHistories } from '../../utils';
import { getDispatchModerationContext } from '../../utils/runtime';
import { getWorkflowNodeMemoryKey } from '../../context/memory';
import {
  buildAgentLoopCoreDoneMemories,
  buildAgentLoopCoreFinalAssistantOutput,
  buildAgentLoopCoreInput,
  buildAgentLoopCorePausedMemories,
  createAgentLoopCoreChildInteractiveParams,
  prepareAgentLoopCoreProviderRunState,
  readAgentLoopCoreActivePlan,
  readAgentLoopCoreProviderStateMemory,
  runAgentLoopCoreWithSummary
} from '../agentLoopCore/interface';
import {
  buildAgentLoopCoreRequestMessages,
  filterAgentLoopCoreHistoryTools
} from '../agentLoopCore/application/context/messages';
import { ensureWorkflowSandboxReadyForUse } from '../sandbox';
import { SubAppIds, getSystemToolInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import {
  AgentPromptRefRegistry,
  refFromBuiltin,
  refFromSkill,
  type AgentPromptRefEntry
} from '@fastgpt/global/core/workflow/node/agent/promptRef/registry';
import { createWorkflowAgentLoopRuntime } from './adapter/runtime';
import { createAgentNodeResponseCollector } from './nodeResponseCollector';
import { ensureAgentSandboxRuntime } from './sub/sandbox/prepare';
import { createAgentSubAppLookup, getWorkflowAgentLoopProvider } from './utils';
import { checkModelContextModeration } from '../../../../plugin/moderation/modelInput';
import { MODERATION_BLOCKED_ERROR_MESSAGE } from '@fastgpt/global/core/plugin/moderation/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { translateApiMessage } from '../../../../../common/i18n/request';

/** i18n key 的命名空间形态（`ns:key`）；解析失败时不允许把这种文本写进用户可见正文。 */
const I18N_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*:/;

/**
 * 失败提示进入 SSE、聊天记录与节点详情前的统一本地化入口。
 * 复用服务端请求翻译上下文（`translateApiMessage`）按本轮语言解析 i18n key；
 * 供应商原始错误（非 key）原样保留。
 */
const localizeAgentErrorText = (text?: string) => (text ? translateApiMessage(text) : '');

/**
 * 计算本轮要展示的失败提示：优先使用可翻译的错误原因，其次使用静态兜底 key。
 * 后台任务等没有请求翻译上下文时 `translateApiMessage` 会原样返回 key，这类值不能
 * 进入正文，因此直接跳过（此时节点仍通过 `errorText` 暴露失败原因）。
 */
const resolveAgentErrorNoticeText = (errorText?: string) => {
  const localizedError = localizeAgentErrorText(errorText);
  if (localizedError && !I18N_KEY_PATTERN.test(localizedError)) return localizedError;

  const localizedFallback = localizeAgentErrorText('chat:agent_run_failed_fallback');
  return localizedFallback && !I18N_KEY_PATTERN.test(localizedFallback) ? localizedFallback : '';
};

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatAudio]?: boolean;
  [NodeInputKeyEnum.aiChatVideo]?: boolean;
  [NodeInputKeyEnum.aiChatExtractFiles]?: boolean;
  [NodeInputKeyEnum.aiChatMaxToken]?: number;
  [NodeInputKeyEnum.aiChatIsResponseText]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffort;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModelId]?: string;
  [NodeInputKeyEnum.aiModel]?: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;

  [NodeInputKeyEnum.selectedTools]?: AgentToolType[];
  [NodeInputKeyEnum.skills]?: SelectedAgentSkillItemType[];
  [NodeInputKeyEnum.editSkillId]?: string;

  [NodeInputKeyEnum.datasetParams]?: AppFormEditFormType['dataset'];
  [NodeInputKeyEnum.datasetSelectList]?: AppFormEditFormType['dataset']['datasets'];
  [NodeInputKeyEnum.datasetSimilarity]?: number;
  [NodeInputKeyEnum.datasetMaxTokens]?: number;
  [NodeInputKeyEnum.datasetSearchMode]?: AppFormEditFormType['dataset']['searchMode'];
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;
  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModelId]?: string;
  /** @deprecated */
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;
  [NodeInputKeyEnum.datasetSearchRerankCandidateNum]?: number;
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModelId]?: string;
  /** @deprecated */
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  [NodeInputKeyEnum.collectionFilterMatch]?: string;
  [NodeInputKeyEnum.authTmbId]?: boolean;
  [NodeInputKeyEnum.useAgentSandbox]?: boolean;
  [NodeInputKeyEnum.sandboxEntrypoint]?: string;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

/**
 * Agent 节点入口。
 * 负责准备历史、文件、工具和能力插件，维护节点级交互恢复状态，然后把实际循环执行交给统一 agentLoop 入口。
 */
export const dispatchRunAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  const {
    node: { nodeId, inputs },
    lang,
    histories,
    query,
    lastInteractive,
    runningAppInfo,
    runningUserInfo,
    agentSandboxPrepareActions,
    usagePush,
    chatId,
    uid,
    responseChatItemId,
    timezone,
    params: {
      systemPrompt = '',
      userChatInput,
      agent_selectedTools: selectedTools = [],
      skills: selectedSkills = [],
      editSkillId,
      useAgentSandbox = false,
      sandboxEntrypoint,
      modelId,
      model,
      isResponseAnswerText = true,
      aiChatReasoning
    }
  } = props;
  const datasetParams = getAgentDatasetParams(props.params);
  // 简易模式（对话 Agent 表单转化出的单节点工作流）固定携带 agent_datasetParams，
  // Skill 调试模式固定使用 skillEdit sourceType 或 editSkillId；这两类入口保持内部步骤平铺在顶层，
  // 仅工作流画布上的 Agent 节点生成外层 Agent 根响应并收纳内部步骤。
  const isSimpleChatAgent = Boolean(
    props.params[NodeInputKeyEnum.datasetParams] ||
    inputs.some((input) => input.key === NodeInputKeyEnum.datasetParams)
  );
  const shouldWrapNodeResponses =
    runningAppInfo.sourceType !== ChatSourceTypeEnum.skillEdit &&
    !editSkillId &&
    !isSimpleChatAgent;

  // assistantResponses 贯穿整轮 dispatch；Agent 内部 nodeResponse 由 sink 逐条发布。
  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponseCollector = createAgentNodeResponseCollector({
    nodeResponseSink: getWorkflowContext().nodeResponseSink,
    nodeResponseParentId: shouldWrapNodeResponses ? props.nodeResponseParentId : undefined
  });
  // 简易模式下主模型、工具和压缩响应平铺在当前层；工作流模式下未显式携带 parentId 的步骤统一挂在当前 Agent 节点响应下。
  const appendAgentNodeResponse = (response: ChatHistoryItemResType) =>
    nodeResponseCollector.appendNodeResponse(response);
  const agentModel = await loadWorkflowModelResource({
    appTeamId: runningAppInfo.teamId,
    userInfo: runningUserInfo,
    modelId,
    model
  });
  // 旧 params.model 仅保留给兼容读取；Agent 请求链使用规范化 modelData。
  props.params.model = agentModel.model;
  props.params.aiChatVision = !!(props.params.aiChatVision && agentModel.config.vision);
  props.params.aiChatAudio = !!(props.params.aiChatAudio && agentModel.config.audio);
  props.params.aiChatVideo = !!(props.params.aiChatVideo && agentModel.config.video);
  if (props.params.aiChatExtractFiles !== undefined) {
    props.params.aiChatExtractFiles = !!(
      props.params.aiChatExtractFiles &&
      (props.params.aiChatVision || props.params.aiChatAudio || props.params.aiChatVideo)
    );
  }

  const skillIds = editSkillId ? [editSkillId] : selectedSkills.map(({ skillId }) => skillId);
  const hasSandboxRuntimeDependency = !!editSkillId || skillIds.length > 0;
  const sandboxRequested = hasSandboxRuntimeDependency || !!useAgentSandbox;
  const memoryContext = getWorkflowContext().memoryContext;
  const sandboxContext = getWorkflowSandboxContext({
    sourceType: runningAppInfo.sourceType,
    sourceId: runningAppInfo.sourceId,
    teamId: runningAppInfo.teamId,
    userId: uid,
    chatId
  });
  const { sourceType: sandboxSourceType, sourceId: sandboxSourceId } = sandboxContext;
  const isAppChat = sandboxSourceType === ChatSourceTypeEnum.app;
  const appSandboxAvailability = isAppChat
    ? await resolveAppSandboxAvailability({
        appEnabled: !!useAgentSandbox,
        teamId: sandboxContext.teamId
      })
    : undefined;
  const effectiveUseAgentSandbox = isAppChat
    ? appSandboxAvailability?.available === true
    : sandboxRequested;
  const effectiveSkillIds = effectiveUseAgentSandbox ? skillIds : [];
  const effectiveSelectedSkills = effectiveUseAgentSandbox ? selectedSkills : [];
  const effectiveSandboxEntrypoint =
    effectiveUseAgentSandbox && useAgentSandbox ? sandboxEntrypoint : undefined;
  const skipSandboxInputFiles = runningAppInfo.sourceType === ChatSourceTypeEnum.skillEdit;

  // 初始化对话框输入的文件
  const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
  const parseHistoryFiles = !!fileUrlInput?.value?.length;
  const fileLinks = parseHistoryFiles ? props.params.fileUrlList : undefined;

  const provider = getWorkflowAgentLoopProvider();
  const agentMemoryContext = memoryContext.fork(`node:${nodeId}`);
  // FastAgent 作为子工具或子应用运行时，其输出在父级历史中会被标记为 displayOnly 或跨轮置空。
  // 交互恢复时优先从节点作用域 memoryContext 恢复暂停前保存的完整 transcript，缺省再回退到历史。
  const storedMemory =
    provider === 'fastAgent' && lastInteractive
      ? memoryContext.readNodeMemory<ChatItemMiniType[]>({
          runningAppInfo,
          nodeId
        })
      : undefined;
  const restoredMessages =
    Array.isArray(storedMemory) && storedMemory.length > 0 ? storedMemory : undefined;
  const getRestoredAssistantResponses = (messages?: ChatItemMiniType[]) => {
    if (!messages?.length) return [];

    // fastAgent 仅在首次进入节点（!lastInteractive）时写入 inputContext；
    // 最后一个携带 inputContext 的 AI 消息即本次节点运行的首个暂停轮次起点。
    const startIndex = messages.findLastIndex(
      (item) =>
        item.obj === ChatRoleEnum.AI &&
        item.value.some((value) => !value.displayOnly && value.inputContext !== undefined)
    );
    if (startIndex < 0) return [];

    return messages
      .slice(startIndex)
      .flatMap((item) => (item.obj === ChatRoleEnum.AI ? item.value : []));
  };
  const buildClearedNodeMemories = () =>
    provider === 'piAgent' || restoredMessages !== undefined
      ? buildAgentLoopCoreDoneMemories({ memoryContext, runningAppInfo, nodeId })
      : undefined;
  const buildAgentMemories = (ownMemories?: Record<string, any>) => {
    const merged = {
      ...agentMemoryContext.getDelta(),
      ...ownMemories
    };
    return Object.keys(merged).length > 0 ? merged : undefined;
  };
  const cleanedInteractiveHistories = lastInteractive
    ? removeUnfinishedInteractiveHistories(histories)
    : undefined;
  const buildAgentNodeResponse = ({
    textOutput,
    errorText
  }: {
    textOutput?: string;
    errorText?: string;
  } = {}) => {
    if (!shouldWrapNodeResponses) return undefined;

    const { childResponseCount } = nodeResponseCollector.getWorkflowRuntimeSummary();

    return {
      model: agentModel.name,
      query: userChatInput,
      ...(textOutput !== undefined ? { textOutput } : {}),
      ...(childResponseCount !== undefined ? { childResponseCount } : {}),
      ...(errorText !== undefined ? { errorText } : {})
    };
  };
  try {
    if (!isAppChat && sandboxRequested) {
      await assertSandboxAvailable(sandboxContext.teamId);
    }

    const { fileContext } = getWorkflowContext();
    const userContext = await useUserContext({
      histories: restoredMessages ? [] : histories,
      currentFiles: fileLinks,
      currentUserInput: userChatInput,
      currentQuery: query,
      currentDataId: responseChatItemId,
      parseHistoryFiles,
      selectedDataset: datasetParams?.datasets,
      authTmbId: datasetParams?.authTmbId,
      tmbId: runningUserInfo.tmbId,
      timezone,
      maxFileAmount: fileContext.limits.maxFileAmount
    });

    // 初始化 sandbox：初始化、注入 skills、files。命中 Version 快照的 Skill 由快照授权，未命中的检查运行人权限。
    const prepareRuntime = (runtimeOptions?: {
      onUpgrade?: () => void;
      onUpgradeComplete?: () => void;
    }) =>
      ensureAgentSandboxRuntime({
        sourceType: sandboxSourceType,
        sourceId: sandboxSourceId,
        userId: sandboxContext.userId,
        chatId: sandboxContext.chatId,
        tmbId: runningUserInfo.tmbId,
        needSandboxRuntime: effectiveUseAgentSandbox,
        sandboxEntrypoint: effectiveSandboxEntrypoint,
        sandboxEntrypointScope: `${runningAppInfo.sourceType}:${runningAppInfo.sourceId}:node:${nodeId}`,
        skillIds: effectiveSkillIds,
        selectedSkills: effectiveSelectedSkills,
        editSkillId,
        prepareActions: agentSandboxPrepareActions,
        currentFiles: skipSandboxInputFiles ? [] : userContext.currentFiles,
        onUpgrade: runtimeOptions?.onUpgrade,
        onUpgradeComplete: runtimeOptions?.onUpgradeComplete
      });
    const { sandboxClient, currentWorkingDirectory, skillInfos } = effectiveUseAgentSandbox
      ? await ensureWorkflowSandboxReadyForUse({
          sourceType: sandboxSourceType,
          sourceId: sandboxSourceId,
          userId: sandboxContext.userId,
          chatId: sandboxContext.chatId,
          teamId: sandboxContext.teamId,
          prepareRuntime
        })
      : await prepareRuntime();
    if (effectiveUseAgentSandbox) {
      props.nodeSummary?.mergeNodeSummary({ hasAgentSandbox: true });
    }

    // 获取请求上下文
    const { queryInput } = userContext;
    const { rewrittenHistories, currentUserMessage } = await userContext.getCurrentMessages({
      skillInfos,
      currentWorkingDirectory
    });
    const baseHistories = restoredMessages ?? rewrittenHistories;

    // 转化成请求的 messages
    // 交互恢复时，query 只是用户对交互节点的回答/恢复参数，provider 会把它写入
    // 对应的 tool response；不能再次作为新的 user message 追加到模型上下文。
    const requestMessages =
      provider === 'fastAgent' && lastInteractive?.type === 'agentAsk'
        ? [...baseHistories, { ...currentUserMessage, value: query }]
        : lastInteractive
          ? baseHistories
          : [...baseHistories, currentUserMessage];
    // 汇总用户选择工具和知识库 runtime tool。
    // plan/ask/sandbox/readFile 由 agentLoop provider 根据 systemTools 注入，不混入业务 completionTools。
    const {
      completionTools: agentCompletionTools,
      subAppsMap: agentSubAppsMap,
      promptToolRefEntries
    } = await getSubapps({
      tools: selectedTools,
      tmbId: runningUserInfo.tmbId,
      lang
    });
    const loopMessages = buildAgentLoopCoreRequestMessages({ messages: requestMessages });
    const { getSubAppInfo, getSubApp } = createAgentSubAppLookup({
      subAppsMap: agentSubAppsMap,
      lang
    });
    // 2. 创建 workflow adapter，获取本轮真正暴露给模型的 systemTools，确保内置引用注册与实际工具目录同源。
    // 通用 agent loop 不感知 workflow；工具执行、SSE、usage、nodeResponse 都通过 runtime 参数回调进来。
    // Agent 自身暂停态仍使用父层节点键；仅内部工具绑定派生后的记忆作用域。
    const toolContext = getWorkflowContext().getChildContext({ memoryContext: agentMemoryContext });
    const { runtime, artifacts } = runWithContext(toolContext, () =>
      createWorkflowAgentLoopRuntime({
        context: {
          ...props,
          modelData: agentModel,
          getSubAppInfo,
          getSubApp,
          completionTools: agentCompletionTools,
          currentFiles: userContext.currentFiles,
          sandboxClient
        },
        usagePush,
        assistantResponses,
        appendNodeResponse: appendAgentNodeResponse,
        onToolResult: (result) => {
          props.nodeSummary.mergeNodeSummary(stripNodeSummaryErrorFields(result.nodeSummary));
        }
      })
    );
    // 统一注册 Tools + 已授权部署的 Skills + runtime 实际启用的 Builtins，一步完成 V2/旧格式双读解析。
    const selectedSkillSourceMap = new Map(
      effectiveSelectedSkills
        .filter((skill) => !skill.error && skill.source)
        .map((skill) => [skill.skillId, skill.source])
    );
    const seenSkillIds = new Set<string>();
    const runtimeSkillEntries: AgentPromptRefEntry<RuntimePromptRefMeta>[] = [];
    skillInfos.forEach((info) => {
      if (!info.appId || seenSkillIds.has(info.appId)) return;
      seenSkillIds.add(info.appId);
      const authoritativeSource = info.appSource ?? selectedSkillSourceMap.get(info.appId);
      const { ref, sourceInferred } = refFromSkill({
        skillId: info.appId,
        source: authoritativeSource
      });
      const displayName = info.appName || info.name;
      if (!displayName) return;
      runtimeSkillEntries.push({
        ref,
        displayName,
        sourceInferred,
        meta: {}
      });
    });

    const runtimeBuiltinEntries: AgentPromptRefEntry<RuntimePromptRefMeta>[] = [
      ...(runtime.systemTools?.datasetSearch?.enabled ? [SubAppIds.datasetSearch] : []),
      ...(runtime.systemTools?.readFile?.enabled ? [SubAppIds.readFiles] : []),
      ...(runtime.systemTools?.sandbox?.enabled ? [AGENT_SANDBOX_TOOLSET_ID] : [])
    ].flatMap((builtinId) => {
      const displayName =
        getSubAppInfo(builtinId).name || getSystemToolInfo(builtinId, lang)?.name || '';
      if (!displayName) return [];
      return [
        {
          ref: refFromBuiltin(builtinId),
          displayName,
          meta: {}
        }
      ];
    });

    const runtimeRefRegistry = AgentPromptRefRegistry.create([
      ...promptToolRefEntries,
      ...runtimeSkillEntries,
      ...runtimeBuiltinEntries
    ]);
    const displayNameCount = new Map<string, number>();
    runtimeRefRegistry.entries().forEach((entry) => {
      displayNameCount.set(entry.displayName, (displayNameCount.get(entry.displayName) ?? 0) + 1);
    });
    // 历史里的 system 只作为外部噪音过滤；最终 systemPrompt 在创建 runtime 后按实际工具能力构建。
    // PromptEditor 保存的是引用键，进入主 Agent 前转换为具体名称；同名不同源工具附带函数名消歧。
    const formattedUserSystemPrompt = runtimeRefRegistry.renderForModel({
      text: systemPrompt,
      formatResolved: (entry) => {
        if ((displayNameCount.get(entry.displayName) ?? 0) > 1) {
          const modelToolNames = entry.meta.modelToolNames?.filter(Boolean) ?? [];
          if (modelToolNames.length > 0) {
            return `{{${entry.displayName} (${modelToolNames.join(', ')})}}`;
          }
          return `{{${entry.displayName} (${entry.canonicalKey})}}`;
        }
        return `{{${entry.displayName}}}`;
      },
      onAmbiguous: (rawKey, candidates) => {
        getLogger(LogCategories.MODULE.AI.AGENT).warn('[Agent] ambiguous prompt ref', {
          rawKey,
          candidates: candidates.map((item) => item.canonicalKey)
        });
      }
    });

    // providerState 统一保存 provider 内部恢复信息。
    // FastAgent 使用 ChatItem 重建消息；Pi 暂时保留其原生 providerState。
    const restoredMemory =
      provider === 'piAgent'
        ? readAgentLoopCoreProviderStateMemory({
            memoryContext,
            runningAppInfo,
            nodeId
          })
        : {};
    const activePlan = readAgentLoopCoreActivePlan({
      histories: restoredMessages ?? histories
    });
    const { providerState: runtimeProviderState, isAskResume } =
      prepareAgentLoopCoreProviderRunState({
        restoredProviderState: restoredMemory.providerState,
        hasLastInteractive: !!lastInteractive
      });
    const previousAssistantResponses = lastInteractive
      ? provider === 'piAgent'
        ? (restoredMemory.assistantResponses ?? [])
        : getRestoredAssistantResponses(restoredMessages)
      : [];

    // 锚点 2：对发给 AI 的本轮初始上下文（跳过历史消息）进行一次统一拦截，违规直接节点报错
    const hasCurrentTurnUserMessage =
      !lastInteractive || (provider === 'fastAgent' && lastInteractive?.type === 'agentAsk');
    const contextCheck = await checkModelContextModeration({
      messages: loopMessages,
      systemPrompt: formattedUserSystemPrompt,
      includeLastUserMessage: hasCurrentTurnUserMessage,
      extraUserText:
        provider !== 'fastAgent' && isAskResume ? queryInput || userChatInput : undefined,
      context: getDispatchModerationContext(props)
    });
    if (contextCheck.isBlocked) {
      const errorText = contextCheck.blockErrorMessage ?? MODERATION_BLOCKED_ERROR_MESSAGE;
      return {
        ...getNodeErrResponse({
          error: errorText,
          responseData: buildAgentNodeResponse({ errorText }),
          system_memories: buildAgentMemories(buildClearedNodeMemories())
        }),
        ...(cleanedInteractiveHistories
          ? { [DispatchNodeResponseKeyEnum.rewriteHistories]: cleanedInteractiveHistories }
          : {}),
        [DispatchNodeResponseKeyEnum.assistantResponses]: isResponseAnswerText
          ? assistantResponses
          : undefined
      };
    }

    const agentSystemPrompt = buildDefaultAgentSystemPrompt({
      userSystemPrompt: formattedUserSystemPrompt,
      sandboxEnabled: Boolean(runtime.systemTools?.sandbox?.enabled)
    });

    // 3. 运行单主 loop。
    // 如果上一轮因 ask_user 暂停，这里会把用户回答作为 ask tool response 接回原 messages。
    const { result: coreResult, summary: outputSummary } = await runAgentLoopCoreWithSummary({
      provider,
      runtime,
      input: buildAgentLoopCoreInput({
        messages: filterAgentLoopCoreHistoryTools(loopMessages, runtime),
        systemPrompt: agentSystemPrompt,
        activePlan,
        providerState: provider === 'fastAgent' ? undefined : runtimeProviderState,
        userAnswer:
          provider !== 'fastAgent' && isAskResume ? queryInput || userChatInput : undefined,
        childrenInteractiveParams: createAgentLoopCoreChildInteractiveParams({
          lastInteractive
        })
      }),
      assistantResponses: {
        persistInputContext: provider === 'fastAgent' && !lastInteractive,
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
          setPlanToolName: artifacts.setPlanToolName,
          updatePlanToolName: artifacts.updatePlanToolName,
          askToolName: artifacts.askToolName
        }
      }
    });
    // 4. 输出归一化。
    // 正常结束：模型正文即回复正文。
    // 失败/中断：只在既有助手输出之后追加一条「独立的失败提示」，不再把模型正文与错误
    // 文本拼成整段再做前缀比较——历史/子工具正文会参与比较，导致父正文被重发。
    const errorNoticeText =
      coreResult.status === 'error' ? resolveAgentErrorNoticeText(outputSummary.errorText) : '';
    const finalOutput = buildAgentLoopCoreFinalAssistantOutput({
      assistantResponses: outputSummary.assistantResponses,
      previousAssistantResponses,
      // 失败轮次的模型正文已由 core 写入 assistantResponses 并完成流式推送，这里不再补写，
      // 避免任何已发出的正文重复进入聊天记录或 SSE。
      finalText: coreResult.status === 'error' ? undefined : outputSummary.finalText,
      errorNoticeText,
      reasoningText: outputSummary.reasoningText,
      hideReason: aiChatReasoning === false
    });
    const outputAssistantResponses = finalOutput.assistantResponses;

    if (outputSummary.status === 'interactive' && outputSummary.interactive) {
      const interactiveMemories = buildAgentMemories(
        provider === 'piAgent'
          ? buildAgentLoopCorePausedMemories({
              memoryContext,
              runningAppInfo,
              nodeId,
              providerState: outputSummary.providerState,
              assistantResponses: [...previousAssistantResponses, ...outputAssistantResponses]
            })
          : {
              [getWorkflowNodeMemoryKey({ memoryContext, runningAppInfo, nodeId })]: [
                ...requestMessages,
                {
                  dataId: responseChatItemId,
                  obj: ChatRoleEnum.AI,
                  value: outputAssistantResponses
                }
              ] satisfies ChatItemMiniType[]
            }
      );
      const interactiveNodeResponse = buildAgentNodeResponse({
        textOutput: finalOutput.answerText
      });
      return {
        [DispatchNodeResponseKeyEnum.assistantResponses]: isResponseAnswerText
          ? outputAssistantResponses
          : undefined,
        [DispatchNodeResponseKeyEnum.memories]: interactiveMemories,
        ...(interactiveNodeResponse
          ? { [DispatchNodeResponseKeyEnum.nodeResponse]: interactiveNodeResponse }
          : {}),
        [DispatchNodeResponseKeyEnum.interactive]: outputSummary.interactive
      };
    }

    const doneMemories = buildAgentMemories(buildClearedNodeMemories());
    const errorText = outputSummary.errorText ?? '';

    // 失败提示作为独立增量：同一次输出组装既写入 assistantResponses（聊天记录/节点详情），
    // 也在这里通过既有流式出口发送一次，保证两边文本一致且不会重发已流出的正文。
    if (errorNoticeText && isResponseAnswerText !== false) {
      getWorkflowContext().workflowStreamResponse?.(workflowSseEvent.answerDelta(errorNoticeText));
    }

    const doneNodeResponse = buildAgentNodeResponse({
      // 失败提示已包含在 answerText 内；正常结束的空答案保持原样，避免误报执行失败。
      textOutput: finalOutput.answerText,
      ...(coreResult.status === 'error' ? { errorText } : {})
    });

    const result = {
      data: {
        [NodeOutputKeyEnum.answerText]: finalOutput.answerText
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: finalOutput.answerText,
      [DispatchNodeResponseKeyEnum.memories]: doneMemories,
      [DispatchNodeResponseKeyEnum.assistantResponses]: isResponseAnswerText
        ? finalOutput.assistantResponses
        : undefined,
      ...(doneNodeResponse ? { [DispatchNodeResponseKeyEnum.nodeResponse]: doneNodeResponse } : {}),
      ...(cleanedInteractiveHistories
        ? { [DispatchNodeResponseKeyEnum.rewriteHistories]: cleanedInteractiveHistories }
        : {})
    };
    // 异常与错误分支输出必须同时返回，空错误文本也不能让节点走成功分支。
    return coreResult.status === 'error'
      ? {
          ...result,
          rawError: coreResult.error,
          error: { [NodeOutputKeyEnum.errorText]: errorText },
          [DispatchNodeResponseKeyEnum.toolResponse]: {
            error: errorText
          }
        }
      : result;
  } catch (error) {
    // dispatch 层兜底：异常时清理当前节点的暂停恢复状态；内部详情已经由 sink 发布。
    getLogger(LogCategories.MODULE.AI.AGENT).error(`[Agent] dispatchRunAgent caught error`, {
      error
    });
    return {
      ...getNodeErrResponse({
        error,
        [DispatchNodeResponseKeyEnum.nodeResponse]: buildAgentNodeResponse(),
        [DispatchNodeResponseKeyEnum.memories]: buildAgentMemories(buildClearedNodeMemories())
      }),
      ...(cleanedInteractiveHistories
        ? { [DispatchNodeResponseKeyEnum.rewriteHistories]: cleanedInteractiveHistories }
        : {}),
      [DispatchNodeResponseKeyEnum.assistantResponses]: isResponseAnswerText
        ? assistantResponses
        : undefined
    };
  } finally {
    await nodeResponseCollector.flush();
  }
};
