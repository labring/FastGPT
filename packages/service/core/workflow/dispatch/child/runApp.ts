import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { createWorkflowRuntimeSummary } from '../utils/summary';

import { runWorkflow } from '../index';
import type { RunWorkflowProps } from '../type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  rewriteNodeOutputByHistories,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { type NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { filterWorkflowToolInputVariables } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import { appData2FlowNodeIO } from '@fastgpt/global/common/app/workflow';

import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  getNodeErrResponse,
  getHistories,
  removeUnfinishedInteractiveHistories,
  safePoints
} from '../utils';
import { getWorkflowFileVariableInputs, WorkflowVariableState } from '../context/variables';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { getWorkflowContext, runWithDerivedWorkflowFileContext, runWithContext } from '../context';
import { loadChildWorkflowWithResource } from '../../resource/service';
import { getUserChatInfo } from '../../../../support/user/team/utils';
import { getWorkflowRuntimeSummary } from '../utils/summary';
import { WorkflowMemoryState } from '../../memory/state';

/**
 * 加载并执行子应用工作流（供画布子应用节点与 Agent 子应用工具共用）。
 *
 * - 变量过滤：`resourceType === 'tool'` 时按子应用输入声明过滤 `rawVariables`，`agent` 透传原始变量。
 * - 输入与交互恢复：存在 `lastInteractive` 时优先透传当前轮交互 `query`，否则由 `userChatInput` 与文件列表构造子流程输入。
 * - 流式控制：`forbidStream` 为 `true`（`tool` 默认开启）时关闭子流程 `stream` 与 `workflowStreamResponse`；未禁流且父流程开启流式时先输出换行分隔符再复用父流响应。
 */
export const runChildAppWorkflow = async ({
  appId,
  versionId,
  resourceType,
  userChatInput,
  history,
  userInputFiles = [],
  rawVariables = {},
  forbidStream = resourceType === 'tool',
  ...workflowProps
}: Omit<
  RunWorkflowProps,
  'runtimeNodes' | 'runtimeEdges' | 'chatConfig' | 'memoryState' | 'histories' | 'stream'
> & {
  stream?: boolean;
  memoryState?: WorkflowMemoryState;
  histories?: ChatItemMiniType[];
  node?: { nodeId?: string };
  usagePush?: ModuleDispatchProps<any>['usagePush'];
  nodeSummary?: ModuleDispatchProps<any>['nodeSummary'];
  appId: string;
  versionId?: string;
  resourceType: 'agent' | 'tool';
  userChatInput: string;
  history?: ChatItemMiniType[] | number;
  userInputFiles?: UserChatItemFileItemType[];
  rawVariables?: Record<string, any>;
  forbidStream?: boolean;
}) => {
  const isTool = resourceType === 'tool';
  const { appData, childVersion, resourceContext } = await loadChildWorkflowWithResource({
    appId,
    versionId,
    tmbId: workflowProps.runningUserInfo.tmbId,
    type: resourceType
  });
  const { nodes, edges, chatConfig } = childVersion;
  const isChatAgent = appData.type === AppTypeEnum.chatAgent;

  if (!forbidStream && workflowProps.stream) {
    workflowProps.workflowStreamResponse?.(workflowSseEvent.answerDelta('\n'));
  }

  const resolvedVariables = isTool
    ? filterWorkflowToolInputVariables({
        inputs: appData2FlowNodeIO({ chatConfig, isChatAgent }).inputs,
        variables: rawVariables
      })
    : rawVariables;
  const { fileUrlList, ...childrenAppVariables } = resolvedVariables;
  const resolvedInputFiles =
    isTool && Array.isArray(fileUrlList)
      ? await getWorkflowContext().fileContext.prepareFiles({ files: fileUrlList.map((url: string) => ({ url })) })
      : userInputFiles;

  const interactive = workflowProps.lastInteractive;
  const runtimeNodes = rewriteNodeOutputByHistories(
    storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes, interactive || undefined)),
    interactive
  );
  const runtimeEdges = storeEdges2RuntimeEdges(edges, interactive);
  const theQuery = interactive
    ? workflowProps.query
    : runtimePrompt2ChatsValue({ files: resolvedInputFiles, text: userChatInput });

  // Rewrite children app variables
  const { externalProvider } = await getUserChatInfo(appData.tmbId);
  const childRunningAppInfo = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: String(appData._id),
    teamId: String(appData.teamId),
    tmbId: String(appData.tmbId),
    name: appData.name,
    isChildApp: true
  };
  const parentMemoryState = WorkflowMemoryState.fromWorkflow(workflowProps);
  // ChatAgent 不支持外部配置聊天记录，运行时直接透传父级历史并由内部 AgentNode 应用默认 50 轮限制。
  const effectiveHistory = isChatAgent ? undefined : history;
  const parentHistories = workflowProps.histories ?? [];
  const inputHistories = isTool
    ? []
    : isChatAgent
      ? parentHistories
      : getHistories(effectiveHistory, parentHistories);

  const workflowResult = await runWithDerivedWorkflowFileContext({
    query: theQuery,
    histories: inputHistories,
    files: getWorkflowFileVariableInputs({
      variablesConfig: chatConfig.variables ?? [],
      inputVariables: childrenAppVariables
    }),
    resourceContext,
    fn: async ({ resolveInputFile, query: childQuery, histories: childHistories }) => {
      const childrenVariableState = await WorkflowVariableState.create({
        timezone: workflowProps.timezone,
        runningAppInfo: childRunningAppInfo,
        chatId: workflowProps.chatId,
        responseChatItemId: workflowProps.responseChatItemId,
        histories: childHistories,
        uid: workflowProps.uid,
        variablesConfig: chatConfig.variables,
        inputVariables: childrenAppVariables,
        externalVariables: externalProvider?.externalWorkflowVariables,
        sourceVariableState: getWorkflowContext().variableContext,
        resolveInputFile
      });
      // 应用工具按 appId 隔离记忆作用域；画布子应用按节点隔离，并在自定义历史切片时跳过继承父级记忆。
      const childMemoryState = isTool
        ? parentMemoryState.fork(`app:${childRunningAppInfo.sourceId}`)
        : parentMemoryState.fork(
            workflowProps.node?.nodeId ? `node:${workflowProps.node.nodeId}` : undefined,
            {
              history: effectiveHistory,
              histories: childHistories,
              hasInteractiveResume: !!interactive
            }
          );

      // 统一入口同时服务画布子应用与 Agent 工具；继承根沙箱，独立变量和本层响应摘要。
      const parentContext = getWorkflowContext();
      const childContext = parentContext.getChildContext({
        runtimeControl: { isToolCall: isTool || parentContext.runtimeControl.isToolCall },
        variableContext: childrenVariableState,
        nodeResponseSink: parentContext.nodeResponseSink.getChildContext({
          workflowRuntimeSummary: createWorkflowRuntimeSummary(),
          ...(workflowProps.nodeResponseParentId !== undefined
            ? { defaultParentId: workflowProps.nodeResponseParentId }
            : {})
        })
      });
      const result = await runWithContext(childContext, () => runWorkflow({
        ...workflowProps,
        memoryState: childMemoryState,
        stream: forbidStream ? false : Boolean(workflowProps.stream),
        ...(forbidStream ? { workflowStreamResponse: undefined } : {}),
        runningAppInfo: childRunningAppInfo,
        runtimeNodes,
        runtimeEdges,
        histories: childHistories,
        query: childQuery,
        chatConfig
      }));
      return {
        ...result,
        completeMessages: childHistories.concat(
          interactive ? [] : [{ obj: ChatRoleEnum.Human, value: childQuery }],
          { obj: ChatRoleEnum.AI, value: result.assistantResponses }
        )
      };
    }
  });
  if (isTool) {
    parentMemoryState.merge(workflowResult.system_memories);
  }

  // ChatAgent 的 AgentNode 将包含工具中间轮次与交互恢复前序轮次的完整过程文本写入 toolResponse，
  // 而 assistantResponses 仅保留当前轮次的聊天气泡，优先取 toolResponse 以与原生 AgentNode 保持一致。
  const text =
    isChatAgent && typeof workflowResult.toolResponse === 'string'
      ? workflowResult.toolResponse
      : chatValue2RuntimePrompt(workflowResult.assistantResponses).text;
  const runtimeSummary = getWorkflowRuntimeSummary({
    workflowRuntimeSummary: workflowResult.workflowRuntimeSummary
  });
  if (!isTool) {
    const totalPoints = workflowResult.flowUsages.reduce(
      (sum, item) => sum + safePoints(item.totalPoints),
      0
    );
    workflowProps.usagePush?.([{ moduleName: appData.name, totalPoints }]);
    workflowProps.nodeSummary?.mergeNodeSummary({
      llmInputTokens: runtimeSummary.llmInputTokens,
      llmOutputTokens: runtimeSummary.llmOutputTokens,
      totalPoints,
      citeCollectionIds: runtimeSummary.citeCollectionIds,
      hasAgentSandbox: runtimeSummary.hasAgentSandbox
    });
  }

  return {
    ...workflowResult,
    appData,
    resolvedVariables,
    text,
    runtimeSummary
  };
};

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.forbidStream]?: boolean;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.history]: ChatItemMiniType[];
}>;

/**
 * 执行子应用并保留输出、消耗和交互状态。子流程未捕获错误投影到父节点错误分支；
 * 原始异常已在子流程记录，这里只传递失败文本，避免逐层重复记录同一异常。
 */
export const dispatchRunAppNode = async (props: Props): Promise<Response> => {
  const {
    histories,
    query,
    lastInteractive,
    node: { pluginId: appId, version },
    params: {
      system_forbid_stream = false,
      userChatInput,
      history,
      fileUrlList,
      ...childrenAppVariables
    }
  } = props;
  const { files } = chatValue2RuntimePrompt(query);
  const childrenInteractive =
    lastInteractive?.type === 'childrenInteractive'
      ? lastInteractive.params.childrenResponse
      : undefined;
  const userInputFiles = fileUrlList
    ? await getWorkflowContext().fileContext.prepareFiles({ files: fileUrlList.map((url) => ({ url })) })
    : files;

  if (!childrenInteractive && !userChatInput && userInputFiles.length === 0) {
    return getNodeErrResponse({ error: 'Input is empty' });
  }
  if (!appId) {
    return getNodeErrResponse({ error: 'pluginId is empty' });
  }

  try {
    const {
      appData,
      assistantResponses,
      runTimes,
      workflowInteractiveResponse,
      system_memories,
      customFeedbacks,
      completeMessages,
      text,
      runtimeSummary
    } = await runChildAppWorkflow({
      ...props,
      lastInteractive: childrenInteractive,
      appId,
      versionId: version,
      resourceType: 'agent',
      userChatInput,
      history,
      userInputFiles,
      rawVariables: childrenAppVariables,
      forbidStream: system_forbid_stream
    });

    // 详情由子流程独立发布，父流程需要从摘要显式接收未捕获错误，才能触发自己的错误分支。
    const errorText =
      runtimeSummary.errorCount > 0 ? runtimeSummary.errorText || 'Run workflow failed' : undefined;
    return {
      data: {
        [NodeOutputKeyEnum.answerText]: text,
        [NodeOutputKeyEnum.history]: completeMessages
      },
      ...(errorText !== undefined && {
        error: { [NodeOutputKeyEnum.errorText]: errorText }
      }),
      [DispatchNodeResponseKeyEnum.answerText]: text,
      system_memories,
      [DispatchNodeResponseKeyEnum.interactive]: workflowInteractiveResponse
        ? {
            type: 'childrenInteractive',
            params: {
              childrenResponse: workflowInteractiveResponse
            }
          }
        : undefined,
      ...(!workflowInteractiveResponse && lastInteractive
        ? {
            [DispatchNodeResponseKeyEnum.rewriteHistories]:
              removeUnfinishedInteractiveHistories(histories)
          }
        : {}),
      assistantResponses: system_forbid_stream ? [] : assistantResponses,
      [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        moduleLogo: appData.avatar,
        query: userChatInput,
        textOutput: text,
        childResponseCount: runtimeSummary.childResponseCount,
        ...(errorText !== undefined && { errorText })
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: errorText ?? text,
      [DispatchNodeResponseKeyEnum.customFeedbacks]: customFeedbacks
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
