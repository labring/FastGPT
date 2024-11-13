import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { dispatchWorkFlow } from '../index';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
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
      return fileUrlList.map((url) => parseUrlToFileType(url));
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

  const { flowResponses, flowUsages, assistantResponses, runTimes } = await dispatchWorkFlow({
    ...props,
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
      tmbId: String(appData.tmbId)
    },
    runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
    runtimeEdges: initWorkflowEdgeStatus(edges),
    histories: chatHistories,
    variables: childrenRunVariables,
    query: runtimePrompt2ChatsValue({
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
        totalPoints: usagePoints,
        tokens: 0
      }
    ],
    [DispatchNodeResponseKeyEnum.toolResponses]: text,
    answerText: text,
    history: completeMessages
  };
};
