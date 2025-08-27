import {
  getPluginInputsFromStoreNodes,
  splitCombinePluginId
} from '@fastgpt/global/core/app/plugin/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { authPluginByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { computedPluginUsage } from '../../../app/plugin/utils';
import { filterSystemVariables, getNodeErrResponse } from '../utils';
import { getPluginRunUserQuery } from '@fastgpt/global/core/workflow/utils';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getChildAppRuntimeById } from '../../../app/plugin/controller';
import { runWorkflow } from '../index';
import { getUserChatInfoAndAuthTeamPoints } from '../../../../support/permission/auth/team';
import { dispatchRunTool } from '../child/runTool';
import type { PluginRuntimeType } from '@fastgpt/global/core/app/plugin/type';

type RunPluginProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.forbidStream]?: boolean;
  [key: string]: any;
}>;
type RunPluginResponse = DispatchNodeResultType<
  {
    [key: string]: any;
  },
  {
    [NodeOutputKeyEnum.errorText]?: string;
  }
>;

export const dispatchRunPlugin = async (props: RunPluginProps): Promise<RunPluginResponse> => {
  const {
    node: { pluginId, version },
    runningAppInfo,
    query,
    params: { system_forbid_stream = false, ...data } // Plugin input
  } = props;
  if (!pluginId) {
    return getNodeErrResponse({ error: 'pluginId can not find' });
  }

  let plugin: PluginRuntimeType | undefined;

  try {
    // Adapt <= 4.10 system tool
    const { source, pluginId: formatPluginId } = splitCombinePluginId(pluginId);
    if (source === PluginSourceEnum.systemTool) {
      return await dispatchRunTool({
        ...props,
        node: {
          ...props.node,
          toolConfig: {
            systemTool: {
              toolId: formatPluginId
            }
          }
        }
      });
    }

    /*
      1. Team app
      2. Admin selected system tool
    */
    const { files } = chatValue2RuntimePrompt(query);

    // auth plugin
    const pluginData = await authPluginByTmbId({
      appId: pluginId,
      tmbId: runningAppInfo.tmbId,
      per: ReadPermissionVal
    });

    plugin = await getChildAppRuntimeById({ id: pluginId, versionId: version });

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

    const { externalProvider } = await getUserChatInfoAndAuthTeamPoints(runningAppInfo.tmbId);
    const runtimeVariables = {
      ...filterSystemVariables(props.variables),
      appId: String(plugin.id),
      ...(externalProvider ? externalProvider.externalWorkflowVariables : {})
    };
    const { flowResponses, flowUsages, assistantResponses, runTimes, system_memories } =
      await runWorkflow({
        ...props,
        // Rewrite stream mode
        ...(system_forbid_stream
          ? {
              stream: false,
              workflowStreamResponse: undefined
            }
          : {}),
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
          variables: runtimeVariables,
          files
        }).value,
        chatConfig: {},
        runtimeNodes,
        runtimeEdges: storeEdges2RuntimeEdges(plugin.edges)
      });
    const output = flowResponses.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);

    const usagePoints = await computedPluginUsage({
      plugin,
      childrenUsage: flowUsages,
      error: !!output?.pluginOutput?.error
    });
    return {
      data: output ? output.pluginOutput : {},
      // 嵌套运行时，如果 childApp stream=false，实际上不会有任何内容输出给用户，所以不需要存储
      assistantResponses: system_forbid_stream ? [] : assistantResponses,
      system_memories,
      // responseData, // debug
      [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        moduleLogo: plugin.avatar,
        totalPoints: usagePoints,
        pluginOutput: output?.pluginOutput,
        pluginDetail: pluginData?.permission?.hasWritePer // Not system plugin
          ? flowResponses.filter((item) => {
              const filterArr = [FlowNodeTypeEnum.pluginOutput];
              return !filterArr.includes(item.moduleType as any);
            })
          : undefined
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        {
          moduleName: plugin.name,
          totalPoints: usagePoints
        }
      ],
      [DispatchNodeResponseKeyEnum.toolResponses]: output?.pluginOutput
        ? Object.keys(output.pluginOutput)
            .filter((key) => outputFilterMap[key])
            .reduce<Record<string, any>>((acc, key) => {
              acc[key] = output.pluginOutput![key];
              return acc;
            }, {})
        : null
    };
  } catch (error) {
    return getNodeErrResponse({ error, customNodeResponse: { moduleLogo: plugin?.avatar } });
  }
};
