import type { DispatchSubAppResponse } from '../../type';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { filterSystemVariables } from '../../../../../../../core/workflow/dispatch/utils';
import { authAppByTmbId } from '../../../../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppVersionById } from '../../../../../../../core/app/version/controller';
import { getRunningUserInfoByTmbId } from '../../../../../../../support/user/team/utils';
import { runWorkflow } from '../../../../../../../core/workflow/dispatch';
import {
  getWorkflowEntryNodeIds,
  rewriteNodeOutputByHistories,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getUserChatInfoAndAuthTeamPoints } from '../../../../../../../support/permission/auth/team';
import { getChildAppRuntimeById } from '../../../../../../app/plugin/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getPluginRunUserQuery } from '@fastgpt/global/core/workflow/utils';
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';

type Props = ModuleDispatchProps<{}> & {
  callParams: {
    appId?: string;
    version?: string;
    [key: string]: any;
  };
};

export const dispatchApp = async (props: Props): Promise<DispatchSubAppResponse> => {
  const {
    runningAppInfo,
    workflowStreamResponse,
    variables,
    callParams: {
      appId,
      version,
      userChatInput,
      system_forbid_stream,
      history,
      fileUrlList,
      ...data
    }
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
    versionId: version,
    app: appData
  });

  // Rewrite children app variables
  const systemVariables = filterSystemVariables(variables);
  const { externalProvider } = await getUserChatInfoAndAuthTeamPoints(appData.tmbId);
  const childrenRunVariables = {
    ...systemVariables,
    histories: [],
    appId: String(appData._id),
    ...data,
    ...(externalProvider ? externalProvider.externalWorkflowVariables : {})
  };

  const runtimeNodes = rewriteNodeOutputByHistories(
    storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes))
  );
  const runtimeEdges = storeEdges2RuntimeEdges(edges);

  const { assistantResponses, flowUsages } = await runWorkflow({
    ...props,
    runningAppInfo: {
      id: String(appData._id),
      teamId: String(appData.teamId),
      tmbId: String(appData.tmbId),
      isChildApp: true
    },
    runningUserInfo: await getRunningUserInfoByTmbId(appData.tmbId),
    runtimeNodes,
    runtimeEdges,
    histories: [],
    variables: childrenRunVariables,
    query: [
      {
        text: {
          content: userChatInput
        }
      }
    ],
    chatConfig
  });

  const { text } = chatValue2RuntimePrompt(assistantResponses);

  return {
    response: text,
    usages: flowUsages
  };
};

export const dispatchPlugin = async (props: Props): Promise<DispatchSubAppResponse> => {
  const {
    runningAppInfo,
    callParams: { appId, version, system_forbid_stream, ...data }
  } = props;

  if (!appId) {
    return Promise.reject(new Error('AppId is empty'));
  }

  // Auth the app by tmbId(Not the user, but the workflow user)
  const {
    app: { tmbId }
  } = await authAppByTmbId({
    appId,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });
  const plugin = await getChildAppRuntimeById({ id: appId, versionId: version });

  const outputFilterMap =
    plugin.nodes
      .find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput)
      ?.inputs.reduce<Record<string, boolean>>((acc, cur) => {
        acc[cur.key] = cur.isToolOutput === false ? false : true;
        return acc;
      }, {}) ?? {};
  const runtimeNodes = storeNodes2RuntimeNodes(
    plugin.nodes,
    getWorkflowEntryNodeIds(plugin.nodes)
  ).map((node) => {
    // Update plugin input value
    if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
      return {
        ...node,
        showStatus: false,
        inputs: node.inputs.map((input) => ({
          ...input,
          value: data[input.key] ?? input.value
        }))
      };
    }
    return {
      ...node,
      showStatus: false
    };
  });

  const { externalProvider } = await getUserChatInfoAndAuthTeamPoints(tmbId);
  const runtimeVariables = {
    ...filterSystemVariables(props.variables),
    appId: String(plugin.id),
    ...(externalProvider ? externalProvider.externalWorkflowVariables : {})
  };

  const { flowResponses, flowUsages, assistantResponses, runTimes, system_memories } =
    await runWorkflow({
      ...props,
      runningAppInfo: {
        id: String(plugin.id),
        // 如果系统插件有 teamId 和 tmbId，则使用系统插件的 teamId 和 tmbId（管理员指定了插件作为系统插件）
        teamId: plugin.teamId || runningAppInfo.teamId,
        tmbId: plugin.tmbId || runningAppInfo.tmbId,
        isChildApp: true
      },
      variables: runtimeVariables,
      query: getPluginRunUserQuery({
        pluginInputs: getPluginInputsFromStoreNodes(plugin.nodes),
        variables: runtimeVariables
      }).value,
      chatConfig: {},
      runtimeNodes,
      runtimeEdges: storeEdges2RuntimeEdges(plugin.edges)
    });
  const output = flowResponses.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);
  const response = output?.pluginOutput ? JSON.stringify(output?.pluginOutput) : 'No output';

  return {
    response,
    usages: flowUsages
  };
};
