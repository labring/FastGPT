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
import { getAppLatestVersion } from '../../../app/controller';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.history]?: ChatItemType[] | number;
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
    node: { pluginId },
    workflowStreamResponse,
    params,
    variables
  } = props;

  const { userChatInput, history, ...childrenAppVariables } = params;
  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }
  if (!pluginId) {
    return Promise.reject('pluginId is empty');
  }

  // Auth the app by tmbId(Not the user, but the workflow user)
  const { app: appData } = await authAppByTmbId({
    appId: pluginId,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });
  const { nodes, edges, chatConfig } = await getAppLatestVersion(pluginId);

  // Auto line
  workflowStreamResponse?.({
    event: SseResponseEventEnum.answer,
    data: textAdaptGptResponse({
      text: '\n'
    })
  });

  const chatHistories = getHistories(history, histories);
  const { files } = chatValue2RuntimePrompt(query);

  // Rewrite children app variables
  const systemVariables = filterSystemVariables(variables);
  const childrenRunVariables = {
    ...systemVariables,
    ...childrenAppVariables,
    histories: chatHistories,
    appId: String(appData._id)
  };

  const { flowResponses, flowUsages, assistantResponses } = await dispatchWorkFlow({
    ...props,
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
      files,
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

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: appData.avatar,
      query: userChatInput,
      textOutput: text,
      totalPoints: flowResponses.reduce((sum, item) => sum + (item.totalPoints || 0), 0)
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: appData.name,
        totalPoints: flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0)
      }
    ],
    answerText: text,
    history: completeMessages
  };
};
