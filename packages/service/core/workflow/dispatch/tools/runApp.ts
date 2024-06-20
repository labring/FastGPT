import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type/index.d';
import { SelectAppItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { dispatchWorkFlow } from '../index';
import { responseWrite } from '../../../../common/response';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  getDefaultEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getHistories } from '../utils';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { authAppByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.history]?: ChatItemType[] | number;
  app: SelectAppItemType;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.history]: ChatItemType[];
}>;

export const dispatchAppRequest = async (props: Props): Promise<Response> => {
  const {
    res,
    app: workflowApp,
    stream,
    detail,
    histories,
    query,
    params: { userChatInput, history, app }
  } = props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  // 检查该工作流的tmb是否有调用该app的权限（不是校验对话的人，是否有权限）
  const { app: appData } = await authAppByTmbId({
    appId: app.id,
    tmbId: workflowApp.tmbId,
    per: ReadPermissionVal
  });

  if (res && stream) {
    responseWrite({
      res,
      event: detail ? SseResponseEventEnum.answer : undefined,
      data: textAdaptGptResponse({
        text: '\n'
      })
    });
  }

  const chatHistories = getHistories(history, histories);
  const { files } = chatValue2RuntimePrompt(query);

  const { flowResponses, flowUsages, assistantResponses } = await dispatchWorkFlow({
    ...props,
    app: appData,
    runtimeNodes: storeNodes2RuntimeNodes(appData.modules, getDefaultEntryNodeIds(appData.modules)),
    runtimeEdges: initWorkflowEdgeStatus(appData.edges),
    histories: chatHistories,
    query: runtimePrompt2ChatsValue({
      files,
      text: userChatInput
    }),
    variables: props.variables
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
