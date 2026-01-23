import type { DispatchSubAppResponse } from '../../type';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { filterSystemVariables } from '../../../../../../../core/workflow/dispatch/utils';
import { authAppByTmbId } from '../../../../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppVersionById } from '../../../../../../../core/app/version/controller';
import {
  getRunningUserInfoByTmbId,
  getUserChatInfo
} from '../../../../../../../support/user/team/utils';
import { runWorkflow } from '../../../../../../../core/workflow/dispatch';
import {
  getWorkflowEntryNodeIds,
  rewriteNodeOutputByHistories,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getChildAppRuntimeById } from '../../../../../../app/tool/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { serverGetWorkflowToolRunUserQuery } from '../../../../../../app/tool/workflowTool/utils';
import { getWorkflowToolInputsFromStoreNodes } from '@fastgpt/global/core/app/tool/workflowTool/utils';
import type { RunWorkflowProps } from '../../../../../../../core/workflow/dispatch';

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
    mcpClientMemory: {},
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

// export const dispatchPlugin = async (props: Props): Promise<DispatchSubAppResponse> => {
//   const {
//     runningAppInfo,
//     callParams: { appId, version, system_forbid_stream, ...data }
//   } = props;

//   if (!appId) {
//     return Promise.reject(new Error('AppId is empty'));
//   }

//   // Auth the app by tmbId(Not the user, but the workflow user)
//   const {
//     app: { tmbId }
//   } = await authAppByTmbId({
//     appId,
//     tmbId: runningAppInfo.tmbId,
//     per: ReadPermissionVal
//   });
//   const plugin = await getChildAppRuntimeById({ id: appId, versionId: version });

//   const outputFilterMap =
//     plugin.nodes
//       .find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput)
//       ?.inputs.reduce<Record<string, boolean>>((acc, cur) => {
//         acc[cur.key] = cur.isToolOutput === false ? false : true;
//         return acc;
//       }, {}) ?? {};
//   const runtimeNodes = storeNodes2RuntimeNodes(
//     plugin.nodes,
//     getWorkflowEntryNodeIds(plugin.nodes)
//   ).map((node) => {
//     // Update plugin input value
//     if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
//       return {
//         ...node,
//         showStatus: false,
//         inputs: node.inputs.map((input) => ({
//           ...input,
//           value: data[input.key] ?? input.value
//         }))
//       };
//     }
//     return {
//       ...node,
//       showStatus: false
//     };
//   });

//   const { externalProvider } = await getUserChatInfo(tmbId);
//   const runtimeVariables = {
//     ...filterSystemVariables(props.variables),
//     appId: String(plugin.id),
//     ...(externalProvider ? externalProvider.externalWorkflowVariables : {})
//   };

//   const { flowResponses, flowUsages, assistantResponses, runTimes, system_memories } =
//     await runWorkflow({
//       ...props,
//       runningAppInfo: {
//         id: String(plugin.id),
//         // 如果系统插件有 teamId 和 tmbId，则使用系统插件的 teamId 和 tmbId（管理员指定了插件作为系统插件）
//         name: plugin.name,
//         teamId: plugin.teamId || runningAppInfo.teamId,
//         tmbId: plugin.tmbId || runningAppInfo.tmbId,
//         isChildApp: true
//       },
//       variables: runtimeVariables,
//       query: serverGetWorkflowToolRunUserQuery({
//         pluginInputs: getWorkflowToolInputsFromStoreNodes(plugin.nodes),
//         variables: runtimeVariables
//       }).value,
//       chatConfig: {},
//       runtimeNodes,
//       runtimeEdges: storeEdges2RuntimeEdges(plugin.edges),
//       stream: false,
//       workflowStreamResponse: undefined
//     });
//   const output = flowResponses.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);
//   const response = output?.pluginOutput ? JSON.stringify(output?.pluginOutput) : 'No output';

//   return {
//     response,
//     result: output?.pluginOutput || {},
//     runningTime: runTimes || 0,
//     usages: flowUsages
//   };
// };
