import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { dispatchWorkFlow } from '../index';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  getLastInteractiveValue,
  getWorkflowEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { filterSystemVariables, getHistories } from '../utils';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { authAppByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppVersionById } from '../../../app/version/controller';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.history]?: ChatItemType[] | number;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.forbidStream]?: boolean;
  [NodeInputKeyEnum.fileUrlList]?: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.history]: ChatItemType[];
}>;

export const dispatchRunAppNode = async (props: Props): Promise<Response> => {
  const {
    runningAppInfo,
    histories,
    query,
    node: { pluginId: appId, version },
    workflowStreamResponse,
    params,
    variables
  } = props;
  // 添加恢复模式检查
  const lastInteractive = getLastInteractiveValue(histories);
  // 增加 context 的空值检查
  const isRecovery = !!lastInteractive?.context?.workflowDepth;

  const {
    system_forbid_stream = false,
    userChatInput,
    history,
    fileUrlList,
    ...childrenAppVariables
  } = params;
  const { files } = chatValue2RuntimePrompt(query);

  const userInputFiles = (() => {
    if (fileUrlList) {
      return fileUrlList.map((url) => parseUrlToFileType(url)).filter(Boolean);
    }
    // Adapt version 4.8.13 upgrade
    return files;
  })();

  if (!userChatInput && !userInputFiles) {
    return Promise.reject('Input is empty');
  }
  if (!appId) {
    return Promise.reject('pluginId is empty');
  }

  // Auth the app by tmbId(Not the user, but the workflow user)
  const { app: appData } = await authAppByTmbId({
    appId: appId,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });
  const { nodes, edges, chatConfig } = await getAppVersionById({
    appId,
    versionId: version,
    app: appData
  });

  const childStreamResponse = system_forbid_stream ? false : props.stream;
  // Auto line
  if (childStreamResponse) {
    workflowStreamResponse?.({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text: '\n'
      })
    });
  }

  const chatHistories = getHistories(history, histories);

  // Rewrite children app variables
  const systemVariables = filterSystemVariables(variables);
  const childrenRunVariables = {
    ...systemVariables,
    ...childrenAppVariables,
    histories: chatHistories,
    appId: String(appData._id)
  };
  let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes));
  let runtimeEdges = initWorkflowEdgeStatus(edges);

  if (isRecovery && lastInteractive?.context) {
    // 恢复父应用上下文
    const context = lastInteractive.context;
    // 如果是在这个 App 内的交互
    if (context.interactiveAppId === String(appId)) {
      props.workflowDispatchDeep = context.workflowDepth;

      // 恢复节点状态
      runtimeNodes = storeNodes2RuntimeNodes(nodes, lastInteractive.entryNodeIds);

      // 恢复边的状态
      runtimeEdges = initWorkflowEdgeStatus(edges, chatHistories);
    }
  }

  const { flowResponses, flowUsages, assistantResponses, runTimes } = await dispatchWorkFlow({
    ...props,
    parentContext: {
      interactiveAppNodeId: props.node?.nodeId,
      interactiveAppId: props.runningAppInfo.id,
      workflowDepth: props.workflowDispatchDeep || 1
    },
    // Rewrite stream mode
    ...(system_forbid_stream
      ? {
          stream: false,
          workflowStreamResponse: undefined
        }
      : {}),
    runningAppInfo: {
      id: String(appData._id),
      teamId: String(appData.teamId),
      tmbId: String(appData.tmbId),
      isChildApp: true
    },
    runtimeNodes,
    runtimeEdges,
    histories: chatHistories,
    variables: childrenRunVariables,
    query: isRecovery
      ? query
      : runtimePrompt2ChatsValue({
          files: userInputFiles,
          text: userChatInput
        }),
    chatConfig
  });

  const completeMessages = chatHistories.concat([
    {
      obj: ChatRoleEnum.Human,
      value: query
    },
    {
      obj: ChatRoleEnum.AI,
      value: assistantResponses
    }
  ]);

  const { text } = chatValue2RuntimePrompt(assistantResponses);
  // 增加个判断指标看本次是否运行的是交互节点，看的是assistantResponses里的[0].interactive
  const isInteractive = !!assistantResponses[0]?.interactive;

  const usagePoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  return {
    assistantResponses: system_forbid_stream ? [] : assistantResponses,
    [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: appData.avatar,
      totalPoints: usagePoints,
      query: userChatInput,
      textOutput: text,
      pluginDetail: appData.permission.hasWritePer ? flowResponses : undefined
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: appData.name,
        totalPoints: usagePoints
      }
    ],
    [DispatchNodeResponseKeyEnum.toolResponses]: text,
    answerText: text,
    history: completeMessages
  };
};
