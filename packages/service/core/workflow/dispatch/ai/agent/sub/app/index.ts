import type { DispatchSubAppResponse } from '../../type';
import { authAppByTmbId } from '../../../../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppVersionById } from '../../../../../../../core/app/version/controller';
import { getUserChatInfo } from '../../../../../../../support/user/team/utils';
import { runWorkflow } from '../../../../../../../core/workflow/dispatch';
import {
  getWorkflowEntryNodeIds,
  rewriteNodeOutputByHistories,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { serverGetWorkflowToolRunUserQuery } from '../../../../../../app/tool/workflowTool/utils';
import { getWorkflowToolInputsFromStoreNodes } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import type { RunWorkflowProps } from '../../../../../../../core/workflow/dispatch';
import { anyValueDecrypt } from '../../../../../../../common/secret/utils';

type Props = Pick<
  RunWorkflowProps,
  | 'checkIsStopping'
  | 'lang'
  | 'requestOrigin'
  | 'mode'
  | 'timezone'
  | 'externalProvider'
  | 'runningAppInfo'
  | 'runningUserInfo'
  | 'retainDatasetCite'
  | 'maxRunTimes'
  | 'workflowDispatchDeep'
  | 'responseAllData'
  | 'responseDetail'
  | 'variables'
> & {
  appId: string;
  userChatInput: string;
  customAppVariables: Record<string, any>;
};

export const dispatchApp = async (props: Props): Promise<DispatchSubAppResponse> => {
  const {
    runningAppInfo,
    runningUserInfo,
    appId,
    variables,
    customAppVariables,
    userChatInput,
    ...data
  } = props;

  if (!appId) {
    return Promise.reject(new Error('AppId is empty'));
  }

  // Auth the app by tmbId(Not the user, but the workflow user)
  const { app: appData } = await authAppByTmbId({
    appId,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });
  const { nodes, edges, chatConfig } = await getAppVersionById({
    appId,
    app: appData
  });

  // Rewrite children app variables
  const { externalProvider } = await getUserChatInfo(appData.tmbId);
  const childrenRunVariables = {
    userId: variables.userId,
    appId: String(appData._id),
    chatId: variables.chatId,
    responseChatItemId: variables.responseChatItemId,
    histories: [],
    cTime: variables.cTime,
    ...customAppVariables,
    ...(externalProvider ? externalProvider.externalWorkflowVariables : {})
  };

  const runtimeNodes = rewriteNodeOutputByHistories(
    storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes))
  );
  const runtimeEdges = storeEdges2RuntimeEdges(edges);

  const { assistantResponses, flowUsages, runTimes } = await runWorkflow({
    ...data,
    uid: variables.userId,
    chatId: variables.chatId,
    responseChatItemId: variables.responseChatItemId,
    runningAppInfo: {
      id: String(appData._id),
      name: appData.name,
      teamId: String(appData.teamId),
      tmbId: String(appData.tmbId),
      isChildApp: true
    },
    runningUserInfo,
    runtimeNodes,
    runtimeEdges,
    chatConfig,
    histories: [],
    variables: childrenRunVariables,
    query: [
      {
        text: {
          content: userChatInput
        }
      }
    ],
    stream: false,
    workflowStreamResponse: undefined
  });

  const { text } = chatValue2RuntimePrompt(assistantResponses);

  return {
    response: text,
    result: {},
    runningTime: runTimes || 0,
    usages: flowUsages
  };
};

export const dispatchPlugin = async (props: Props): Promise<DispatchSubAppResponse> => {
  const {
    runningAppInfo,
    runningUserInfo,
    appId,
    variables,
    customAppVariables,
    userChatInput,
    ...data
  } = props;

  if (!appId) {
    return Promise.reject(new Error('AppId is empty'));
  }

  // Auth the app by tmbId(Not the user, but the workflow user)
  const { app: appData } = await authAppByTmbId({
    appId,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });
  const { nodes, edges, chatConfig } = await getAppVersionById({
    appId,
    app: appData
  });

  // Rewrite children app variables
  const { externalProvider } = await getUserChatInfo(appData.tmbId);
  const childrenRunVariables: Record<string, any> = {
    userId: variables.userId,
    appId: String(appData._id),
    chatId: variables.chatId,
    responseChatItemId: variables.responseChatItemId,
    histories: [],
    cTime: variables.cTime,
    ...customAppVariables,
    ...(externalProvider ? externalProvider.externalWorkflowVariables : {})
  };
  const runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)).map(
    (node) => {
      // Update plugin input value
      if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
        return {
          ...node,
          showStatus: false,
          inputs: node.inputs.map((input) => {
            let val = childrenRunVariables[input.key] ?? input.value;
            if (input.renderTypeList.includes(FlowNodeInputTypeEnum.password)) {
              val = anyValueDecrypt(val);
            } else if (
              input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
              Array.isArray(val) &&
              childrenRunVariables[input.key]
            ) {
              childrenRunVariables[input.key] = val.map((item) =>
                typeof item === 'string' ? item : item.url
              );
            }

            return {
              ...input,
              value: val
            };
          })
        };
      }
      return {
        ...node,
        showStatus: false
      };
    }
  );
  const runtimeEdges = storeEdges2RuntimeEdges(edges);

  const outputFilterMap =
    nodes
      .find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput)
      ?.inputs.reduce<Record<string, boolean>>((acc, cur) => {
        acc[cur.key] = cur.isToolOutput === false ? false : true;
        return acc;
      }, {}) ?? {};

  const { flowResponses, flowUsages, runTimes } = await runWorkflow({
    ...data,
    uid: variables.userId,
    chatId: variables.chatId,
    responseChatItemId: variables.responseChatItemId,
    runningAppInfo: {
      id: String(appData._id),
      // 如果系统插件有 teamId 和 tmbId，则使用系统插件的 teamId 和 tmbId（管理员指定了插件作为系统插件）
      name: appData.name,
      teamId: appData.teamId || runningAppInfo.teamId,
      tmbId: appData.tmbId || runningAppInfo.tmbId,
      isChildApp: true
    },
    runningUserInfo,
    runtimeNodes,
    runtimeEdges,
    chatConfig,
    histories: [],
    variables: childrenRunVariables,
    query: serverGetWorkflowToolRunUserQuery({
      pluginInputs: getWorkflowToolInputsFromStoreNodes(nodes),
      variables: childrenRunVariables
    }).value,
    stream: false,
    workflowStreamResponse: undefined
  });

  const output = flowResponses.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);
  const response = output?.pluginOutput
    ? JSON.stringify(
        Object.keys(output.pluginOutput)
          .filter((key) => outputFilterMap[key])
          .reduce<Record<string, any>>((acc, key) => {
            acc[key] = output.pluginOutput![key];
            return acc;
          }, {})
      )
    : 'Run plugin failed';

  return {
    response,
    result: output?.pluginOutput || {},
    runningTime: runTimes || 0,
    usages: flowUsages
  };
};
