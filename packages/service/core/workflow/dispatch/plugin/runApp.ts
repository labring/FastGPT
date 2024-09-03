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
    app: workflowApp,
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
    tmbId: workflowApp.tmbId,
    per: ReadPermissionVal
  });

  // Auto line
  workflowStreamResponse?.({
    event: SseResponseEventEnum.answer,
    data: textAdaptGptResponse({
      text: '\n'
    })
  });

  const chatHistories = getHistories(history, histories);
  const { files } = chatValue2RuntimePrompt(query);

  // Concat variables
  const systemVariables = filterSystemVariables(variables);
  const childrenRunVariables = {
    ...systemVariables,
    ...childrenAppVariables
  };

  const { flowResponses, flowUsages, assistantResponses } = await dispatchWorkFlow({
    ...props,
    app: appData,
    runtimeNodes: storeNodes2RuntimeNodes(
      appData.modules,
      getWorkflowEntryNodeIds(appData.modules)
    ),
    runtimeEdges: initWorkflowEdgeStatus(appData.edges),
    histories: chatHistories,
    query: runtimePrompt2ChatsValue({
      files,
      text: userChatInput
    }),
    variables: childrenRunVariables
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
