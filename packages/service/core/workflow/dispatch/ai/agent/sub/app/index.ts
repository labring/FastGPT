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

  const { assistantResponses, flowUsages } = await runWorkflow({
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
      toolRes: text
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

  const { flowResponses, flowUsages, runTimes } = await runWorkflow({
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
    usages: flowUsages,
    nodeResponse: {
      moduleType: FlowNodeTypeEnum.pluginModule,
      moduleName: app.name,
      moduleLogo: app.avatar,
      toolInput: customAppVariables,
      toolRes: output?.pluginOutput || {}
    }
  };
};
