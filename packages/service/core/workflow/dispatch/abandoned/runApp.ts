/* Abandoned */
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';

import { type SelectAppItemType } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp/type';
import { runWorkflow } from '../index';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getHistories } from '../utils';
import { getWorkflowFileVariableInputs, WorkflowVariableState } from '../utils/variables';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { authAppByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getUserChatInfo } from '../../../../support/user/team/utils';
import { runWithDerivedWorkflowFileContext } from '../../utils/context';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
  app: SelectAppItemType;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.history]: ChatItemMiniType[];
}>;

export const dispatchAppRequest = async (props: Props): Promise<Response> => {
  const {
    runningAppInfo,
    workflowStreamResponse,
    histories,
    query,
    variableState,
    params: { userChatInput, history, app }
  } = props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  // 检查该工作流的tmb是否有调用该app的权限（不是校验对话的人，是否有权限）
  const { app: appData } = await authAppByTmbId({
    appId: app.id,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });

  workflowStreamResponse?.(workflowSseEvent.fastAnswerDelta('\n'));

  const chatHistories = getHistories(history, histories);
  const { files } = chatValue2RuntimePrompt(query);
  const childRunningAppInfo = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: String(appData._id),
    name: appData.name,
    teamId: String(appData.teamId),
    tmbId: String(appData.tmbId),
    isChildApp: true
  };
  const { externalProvider } = await getUserChatInfo(appData.tmbId);
  const childInputVariables = variableState.toStoreRecord();
  const childQuery = runtimePrompt2ChatsValue({
    files,
    text: userChatInput
  });
  let filteredChildHistories = chatHistories;
  let filteredChildQuery = childQuery;

  const { assistantResponses, system_memories, runtimeNodeResponseSummary } =
    await runWithDerivedWorkflowFileContext({
      query: childQuery,
      histories: chatHistories,
      files: getWorkflowFileVariableInputs({
        variablesConfig: appData.chatConfig?.variables,
        inputVariables: childInputVariables
      }),
      fn: async ({ resolveInputFile, query: filteredQuery, histories: filteredHistories }) => {
        filteredChildHistories = filteredHistories;
        filteredChildQuery = filteredQuery;
        const childVariableState = await WorkflowVariableState.create({
          timezone: props.timezone,
          runningAppInfo: childRunningAppInfo,
          uid: props.uid,
          chatId: props.chatId,
          responseChatItemId: props.responseChatItemId,
          histories: filteredHistories,
          variablesConfig: appData.chatConfig?.variables,
          inputVariables: childInputVariables,
          externalVariables: externalProvider?.externalWorkflowVariables,
          sourceVariableState: variableState,
          resolveInputFile
        });

        return runWorkflow({
          ...props,
          runningAppInfo: childRunningAppInfo,
          runtimeNodes: storeNodes2RuntimeNodes(
            appData.modules,
            getWorkflowEntryNodeIds(appData.modules)
          ),
          runtimeEdges: storeEdges2RuntimeEdges(appData.edges),
          variableState: childVariableState,
          chatConfig: appData.chatConfig,
          histories: filteredHistories,
          query: filteredQuery
        });
      }
    });

  const completeMessages = filteredChildHistories.concat([
    {
      obj: ChatRoleEnum.Human,
      value: filteredChildQuery
    },
    {
      obj: ChatRoleEnum.AI,
      value: assistantResponses
    }
  ]);

  const { text } = chatValue2RuntimePrompt(assistantResponses);

  return {
    data: {
      answerText: text,
      history: completeMessages
    },
    [DispatchNodeResponseKeyEnum.answerText]: text,
    assistantResponses,
    system_memories,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: appData.avatar,
      query: userChatInput,
      textOutput: text,
      totalPoints: runtimeNodeResponseSummary.totalPoints
    }
  };
};
