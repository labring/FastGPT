import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';

import { runWorkflow } from '../index';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  rewriteNodeOutputByHistories,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { type NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getNodeErrResponse, getHistories } from '../utils';
import { getWorkflowFileVariableInputs, WorkflowVariableState } from '../utils/variables';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { prepareWorkflowFiles, runWithDerivedWorkflowFileContext } from '../../utils/context';
import { loadChildWorkflowWithResource } from '../../resource/service';
import { getUserChatInfo } from '../../../../support/user/team/utils';
import { getWorkflowRuntimeSummary } from '../utils/summary';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.forbidStream]?: boolean;
  [NodeInputKeyEnum.fileUrlList]?: string[];
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
    workflowStreamResponse,
    params,
    variableState
  } = props;

  const {
    system_forbid_stream = false,
    userChatInput,
    history,
    fileUrlList,
    ...childrenAppVariables
  } = params;
  const { files } = chatValue2RuntimePrompt(query);

  const childrenInteractive =
    lastInteractive?.type === 'childrenInteractive'
      ? lastInteractive.params.childrenResponse
      : undefined;

  const userInputFiles = await (async () => {
    if (fileUrlList) {
      return prepareWorkflowFiles({ files: fileUrlList.map((url) => ({ url })) });
    }
    // Adapt version 4.8.13 upgrade
    return files;
  })();

  if (!childrenInteractive && !userChatInput && userInputFiles.length === 0) {
    return getNodeErrResponse({ error: 'Input is empty' });
  }
  if (!appId) {
    return getNodeErrResponse({ error: 'pluginId is empty' });
  }

  try {
    const { appData, childVersion, resourceContext } = await loadChildWorkflowWithResource({
      appId,
      versionId: version,
      tmbId: props.runningUserInfo.tmbId,
      type: 'agent'
    });
    const { nodes, edges, chatConfig } = childVersion;

    const childStreamResponse = system_forbid_stream ? false : props.stream;
    // Auto line
    if (childStreamResponse) {
      workflowStreamResponse?.(workflowSseEvent.answerDelta('\n'));
    }

    const chatHistories = getHistories(history, histories);

    const runtimeNodes = rewriteNodeOutputByHistories(
      storeNodes2RuntimeNodes(
        nodes,
        getWorkflowEntryNodeIds(nodes, childrenInteractive || undefined)
      ),
      childrenInteractive
    );

    const runtimeEdges = storeEdges2RuntimeEdges(edges, childrenInteractive);
    const theQuery = childrenInteractive
      ? query
      : runtimePrompt2ChatsValue({ files: userInputFiles, text: userChatInput });

    // Rewrite children app variables
    const { externalProvider } = await getUserChatInfo(appData.tmbId);
    const childRunningAppInfo = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(appData._id),
      teamId: appData.teamId,
      tmbId: appData.tmbId,
      name: appData.name,
      isChildApp: true
    };
    let filteredChildHistories = chatHistories;
    let filteredChildQuery = theQuery;

    const {
      flowUsages,
      assistantResponses,
      runTimes,
      workflowInteractiveResponse,
      system_memories,
      customFeedbacks,
      workflowRuntimeSummary
    } = await runWithDerivedWorkflowFileContext({
      query: theQuery,
      histories: chatHistories,
      files: getWorkflowFileVariableInputs({
        variablesConfig: chatConfig.variables,
        inputVariables: childrenAppVariables
      }),
      resourceContext,
      fn: async ({ resolveInputFile, query: childQuery, histories: childHistories }) => {
        filteredChildHistories = childHistories;
        filteredChildQuery = childQuery;
        const childrenVariableState = await WorkflowVariableState.create({
          timezone: props.timezone,
          runningAppInfo: childRunningAppInfo,
          chatId: props.chatId,
          responseChatItemId: props.responseChatItemId,
          histories: childHistories,
          uid: props.uid,
          variablesConfig: chatConfig.variables,
          inputVariables: childrenAppVariables,
          externalVariables: externalProvider?.externalWorkflowVariables,
          sourceVariableState: variableState,
          resolveInputFile
        });

        return runWorkflow({
          ...props,
          lastInteractive: childrenInteractive,
          // Rewrite stream mode
          ...(system_forbid_stream
            ? {
                stream: false,
                workflowStreamResponse: undefined
              }
            : {}),
          runningAppInfo: {
            sourceType: ChatSourceTypeEnum.app,
            sourceId: String(appData._id),
            name: appData.name,
            teamId: String(appData.teamId),
            tmbId: String(appData.tmbId),
            isChildApp: true
          },
          runtimeNodes,
          runtimeEdges,
          histories: childHistories,
          variableState: childrenVariableState,
          query: childQuery,
          chatConfig
        });
      }
    });

    const completeMessages = filteredChildHistories.concat(
      childrenInteractive
        ? []
        : [
            {
              obj: ChatRoleEnum.Human,
              value: filteredChildQuery
            }
          ],
      {
        obj: ChatRoleEnum.AI,
        value: assistantResponses
      }
    );

    const { text } = chatValue2RuntimePrompt(assistantResponses);

    const usagePoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
    props.usagePush([
      {
        moduleName: appData.name,
        totalPoints: usagePoints
      }
    ]);
    const runtimeSummary = getWorkflowRuntimeSummary({
      workflowRuntimeSummary
    });
    // 详情由子流程独立发布，父流程需要从摘要显式接收未捕获错误，才能触发自己的错误分支。
    const errorText =
      runtimeSummary.errorCount > 0 ? runtimeSummary.errorText || 'Run workflow failed' : undefined;
    props.nodeSummary.mergeNodeSummary({
      llmInputTokens: runtimeSummary.llmInputTokens,
      llmOutputTokens: runtimeSummary.llmOutputTokens,
      totalPoints: usagePoints,
      citeCollectionIds: runtimeSummary.citeCollectionIds
    });
    const childResponseCount = runtimeSummary.childResponseCount;
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
      assistantResponses: system_forbid_stream ? [] : assistantResponses,
      [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        moduleLogo: appData.avatar,
        query: userChatInput,
        textOutput: text,
        childResponseCount,
        ...(errorText !== undefined && { errorText })
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: errorText ?? text,
      [DispatchNodeResponseKeyEnum.customFeedbacks]: customFeedbacks
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
