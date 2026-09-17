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
import { NodeInputKeyEnum, type NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getHistories, safePoints } from '../utils';
import { getWorkflowFileVariableInputs, WorkflowVariableState } from '../utils/variables';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { getUserChatInfo } from '../../../../support/user/team/utils';
import { runWithDerivedWorkflowFileContext } from '../../utils/context';
import { createWorkflowChildResourceContext, loadWorkflowAppResource } from '../../utils/resource';
import { getAppVersionById } from '../../../app/version/controller';
import { nodeHasDynamicInput } from '../../../app/resources';

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

  const dynamicApp = nodeHasDynamicInput(props.node, [NodeInputKeyEnum.runAppSelectApp]);
  const appData = await loadWorkflowAppResource({
    appId: app.id,
    tmbId: props.runningUserInfo.tmbId,
    type: 'agent',
    dynamic: dynamicApp
  });
  const childVersion = await getAppVersionById({
    appId: app.id,
    app: appData
  });
  const resourceContext = await createWorkflowChildResourceContext(
    childVersion.resources,
    String(appData.teamId)
  );

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

  const { assistantResponses, system_memories, flowUsages } =
    await runWithDerivedWorkflowFileContext({
      query: childQuery,
      histories: chatHistories,
      files: getWorkflowFileVariableInputs({
        variablesConfig: childVersion.chatConfig.variables,
        inputVariables: childInputVariables
      }),
      resourceContext,
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
          variablesConfig: childVersion.chatConfig.variables,
          inputVariables: childInputVariables,
          externalVariables: externalProvider?.externalWorkflowVariables,
          sourceVariableState: variableState,
          resolveInputFile
        });

        return runWorkflow({
          ...props,
          runningAppInfo: childRunningAppInfo,
          runtimeNodes: storeNodes2RuntimeNodes(
            childVersion.nodes,
            getWorkflowEntryNodeIds(childVersion.nodes)
          ),
          runtimeEdges: storeEdges2RuntimeEdges(childVersion.edges),
          variableState: childVariableState,
          chatConfig: childVersion.chatConfig,
          histories: filteredHistories,
          query: filteredQuery
        });
      }
    });

  // 子工作流本身不会落账，由当前应用节点统一归集，避免用量遗漏或重复计费。
  const totalPoints = flowUsages.reduce((sum, usage) => sum + safePoints(usage.totalPoints), 0);
  props.usagePush([
    {
      moduleName: appData.name,
      totalPoints
    }
  ]);

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
      totalPoints
    }
  };
};
