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
import { getSystemToolInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getSubapps } from './utils';
import { parseUserSystemPrompt } from './adapter/prompt';
import { useUserContext } from './adapter/userContext';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { serviceEnv } from '../../../../../env';
import { dispatchPiAgent } from './piAgent';
import { getLLMModel } from '../../../../ai/model';
import { runUnifiedAgentLoop, type PlanAskPayload } from '../../../../ai/llm/agentLoop';
import {
  buildWorkflowAgentLoopMemories,
  createWorkflowAgentLoopRuntime,
  getWorkflowAgentLoopMemoryKeys,
  readWorkflowAgentLoopMemory
} from './adapter';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useSandbox } from './sub/sandbox';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemMiniType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatAudio]?: boolean;
  [NodeInputKeyEnum.aiChatVideo]?: boolean;
  [NodeInputKeyEnum.aiChatExtractFiles]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffort;
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
 * 将主 loop 的 ask_agent 追问转换成 workflow interactive 响应，交给前端展示并等待用户回答。
 */
const createAskInteractive = ({
  planId,
  ask
}: {
  planId: string;
  ask: PlanAskPayload;
}): InteractiveNodeResponseType => ({
  type: 'agentPlanAskQuery',
  planId,
  params: {
    content: ask.question,
    reason: ask.reason,
    blockerType: ask.blockerType,
    options: ask.options
  }
});

/**
 * Agent 节点入口。
 * 负责准备历史、文件、工具、能力插件和持久化 memory，然后把实际循环执行交给通用 unified agent loop。
 */
export const dispatchRunAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  // 按环境配置选择 pi-agent-core 分支；默认使用 unified agent loop。
  if (serviceEnv.AGENT_ENGINE === 'pi') {
    return dispatchPiAgent(props);
  }

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

    // 汇总用户选择工具、内置系统工具、知识库/文件工具和 sandbox tools。
    // completionTools 只描述给模型看，subAppsMap 则供 runtime 执行工具时定位真实实现。
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

    console.log('agentSubAppsMap', agentSubAppsMap);
    // runtime 运行详情和工具卡需要根据 function name 反查展示名、头像和描述。
    // 用户工具与系统工具的 id 形态不完全一致，这里统一归一化查询。
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
      const formatId = id.slice(1);
      return agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId);
    };

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

    // ask_agent 追问会把 pendingMainContext 写入 memory。
    // 用户回答后从这里恢复同一条 messages，而不是重新生成一份独立 plan 上下文。
    const restoredMemory = readWorkflowAgentLoopMemory({
      histories: chatHistories,
      nodeId
    });
    // 3. 运行单主 loop。
    // 如果上一轮因 ask_agent 暂停，这里会把用户回答作为 ask tool response 接回原 messages。
    const result = await runUnifiedAgentLoop({
      runtime,
      input: {
        messages: loopMessages,
        systemPrompt: formatedSystemPrompt,
        pendingMainContext: restoredMemory.pendingMainContext,
        userAnswer:
          restoredMemory.pendingMainContext && lastInteractive
            ? queryInput || userChatInput
            : undefined
      }
    });

    if (result.status === 'ask') {
      if (!result.ask) {
        throw new Error('Agent loop returned ask status without ask payload.');
      }

      // ask 状态不产出最终 answer，只返回 interactive + memory。
      // memory 会在用户下一次回复时恢复，保证上下文连续和缓存命中。
      const interactive = createAskInteractive({
        // saveChat 会把该 planId 回写到用户答案上，后续 chats2GPTMessages 据此跳过这条 UI-only 回答。
        planId:
          result.pendingMainContext?.activePlan?.planId ||
          getWorkflowAgentLoopMemoryKeys(nodeId).memoryKey,
        ask: result.ask
      });
      for (let index = assistantResponses.length - 1; index >= 0; index--) {
        const askValue = assistantResponses[index];
        if (askValue.agentAsk && !askValue.agentAsk.planId) {
          askValue.agentAsk.planId = interactive.planId;
          break;
        }
      }

      return {
        [DispatchNodeResponseKeyEnum.nodeResponses]: childNodeResponses,
        [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
        [DispatchNodeResponseKeyEnum.memories]: buildWorkflowAgentLoopMemories({
          nodeId,
          memory: {
            pendingMainContext: result.pendingMainContext
          }
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
    const reasoningValue = result.reasoningText
      ? {
          reasoning: {
            content: result.reasoningText
          },
          ...(aiChatReasoning === false ? { hideReason: true } : {})
        }
      : {};
    const finalText = result.answerText || errorText;

    if (finalText) {
      assistantResponses.push({
        ...reasoningValue,
        text: {
          content: finalText
        }
      });
    }

    // workflow 节点输出需要一个纯文本 answerText；前端展示则继续使用结构化 assistantResponses。
    const answerText = assistantResponses
      .filter((item) => item.text?.content)
      .map((item) => item.text!.content)
      .join('');

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: answerText
      },
      ...(errorText && {
        error: {
          [NodeOutputKeyEnum.errorText]: errorText
        }
      }),
      [DispatchNodeResponseKeyEnum.memories]: buildWorkflowAgentLoopMemories({
        nodeId,
        memory: {}
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
