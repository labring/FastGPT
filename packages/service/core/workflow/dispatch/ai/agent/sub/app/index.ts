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
import { WorkflowVariableState } from '../../../../utils/variables';
import { getRuntimeNodeResponseSummary } from '../../../../utils';

type Props = Pick<
  RunWorkflowProps,
  | 'checkIsStopping'
  | 'lang'
  | 'requestOrigin'
  | 'mode'
  | 'timezone'
  | 'externalProvider'
  | 'uid'
  | 'chatId'
  | 'responseChatItemId'
  | 'runningAppInfo'
  | 'runningUserInfo'
  | 'retainDatasetCite'
  | 'maxRunTimes'
  | 'workflowDispatchDeep'
  | 'responseAllData'
  | 'responseDetail'
  | 'nodeResponseWriter'
  | 'nodeResponseParentId'
  | 'variableState'
> & {
  app: {
    name: string;
    avatar?: string;
    id: string;
  };
  userChatInput: string;
  customAppVariables: Record<string, any>;
};

export const dispatchApp = async (props: Props): Promise<DispatchSubAppResponse> => {
  const {
    runningAppInfo,
    runningUserInfo,
    app,
    variableState,
    customAppVariables,
    userChatInput,
    ...data
  } = props;

  // Auth the app by tmbId(Not the user, but the workflow user)
  const { app: appData } = await authAppByTmbId({
    appId: app.id,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });
  const { nodes, edges, chatConfig } = await getAppVersionById({
    appId: app.id,
    app: appData
  });

  // Rewrite children app variables
  const { externalProvider } = await getUserChatInfo(appData.tmbId);
  const childRunningAppInfo = {
    id: String(appData._id),
    teamId: String(appData.teamId),
    tmbId: String(appData.tmbId),
    name: appData.name,
    isChildApp: true
  };
  const childrenVariableState = await WorkflowVariableState.create({
    timezone: data.timezone,
    runningAppInfo: childRunningAppInfo,
    chatId: data.chatId,
    responseChatItemId: data.responseChatItemId,
    histories: [],
    uid: data.uid,
    variablesConfig: chatConfig.variables,
    inputVariables: customAppVariables,
    externalVariables: externalProvider?.externalWorkflowVariables,
    sourceVariableState: variableState
  });

  const runtimeNodes = rewriteNodeOutputByHistories(
    storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes))
  );
  const runtimeEdges = storeEdges2RuntimeEdges(edges);

  const { assistantResponses, flowUsages, runtimeNodeResponseSummary } = await runWorkflow({
    ...data,
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
    variableState: childrenVariableState,
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
  const runtimeSummary = getRuntimeNodeResponseSummary({
    runtimeNodeResponseSummary
  });

  return {
    response: text,
    usages: flowUsages,
    nodeResponse: {
      moduleType: FlowNodeTypeEnum.appModule,
      moduleName: app.name,
      moduleLogo: app.avatar,
      toolInput: {
        userChatInput,
        ...customAppVariables
      },
      toolRes: text,
      childResponseCount: runtimeSummary.childResponseCount
    }
  };
};

export const dispatchPlugin = async (props: Props): Promise<DispatchSubAppResponse> => {
  const {
    runningAppInfo,
    runningUserInfo,
    app,
    variableState,
    customAppVariables,
    userChatInput,
    ...data
  } = props;
  // plugin 子应用不接收普通 userChatInput；这里解构只为了避免透传给 runWorkflow。
  void userChatInput;

  // Auth the app by tmbId(Not the user, but the workflow user)
  const { app: appData } = await authAppByTmbId({
    appId: app.id,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });
  const { nodes, edges, chatConfig } = await getAppVersionById({
    appId: app.id,
    app: appData
  });

  // Rewrite children app variables
  const { externalProvider } = await getUserChatInfo(appData.tmbId);
  const childRunningAppInfo = {
    id: String(appData._id),
    teamId: String(appData.teamId || runningAppInfo.teamId),
    tmbId: String(appData.tmbId || runningAppInfo.tmbId),
    name: appData.name,
    isChildApp: true
  };
  const childrenVariableState = await WorkflowVariableState.create({
    timezone: data.timezone,
    runningAppInfo: childRunningAppInfo,
    chatId: data.chatId,
    responseChatItemId: data.responseChatItemId,
    histories: [],
    uid: data.uid,
    variablesConfig: [],
    inputVariables: {},
    externalVariables: externalProvider?.externalWorkflowVariables,
    sourceVariableState: variableState
  });
  const runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)).map(
    (node) => {
      // Update plugin input value
      if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
        return {
          ...node,
          showStatus: false,
          inputs: node.inputs.map((input) => {
            let val = customAppVariables[input.key] ?? input.value;
            if (input.renderTypeList.includes(FlowNodeInputTypeEnum.password)) {
              val = anyValueDecrypt(val);
            } else if (
              input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
              Array.isArray(val) &&
              customAppVariables[input.key]
            ) {
              customAppVariables[input.key] = val.map((item) =>
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

  const { flowUsages, runtimeNodeResponseSummary } = await runWorkflow({
    ...data,
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
    variableState: childrenVariableState,
    query: serverGetWorkflowToolRunUserQuery({
      pluginInputs: getWorkflowToolInputsFromStoreNodes(nodes),
      variables: customAppVariables
    }).value,
    stream: false,
    workflowStreamResponse: undefined
  });

  const runtimeSummary = getRuntimeNodeResponseSummary({
    runtimeNodeResponseSummary
  });
  const pluginOutput = runtimeSummary.pluginOutput;
  const response = pluginOutput
    ? JSON.stringify(
        Object.keys(pluginOutput)
          .filter((key) => outputFilterMap[key])
          .reduce<Record<string, any>>((acc, key) => {
            acc[key] = pluginOutput[key];
            return acc;
          }, {})
      )
    : 'Run plugin failed';

  return {
    response,
    usages: flowUsages,
    nodeResponse: {
      moduleType: FlowNodeTypeEnum.pluginModule,
      moduleName: app.name,
      moduleLogo: app.avatar,
      toolInput: customAppVariables,
      toolRes: pluginOutput || {},
      childResponseCount: runtimeSummary.childResponseCount
    }
  };
};
