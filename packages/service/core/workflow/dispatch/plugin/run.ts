import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { dispatchWorkFlow } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getPluginRuntimeById } from '../../../app/plugin/controller';
import {
  getWorkflowEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { authPluginByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { computedPluginUsage } from '../../../app/plugin/utils';
import { filterSystemVariables } from '../utils';
import { getPluginRunUserQuery } from '../../utils';

type RunPluginProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
type RunPluginResponse = DispatchNodeResultType<{}>;

export const dispatchRunPlugin = async (props: RunPluginProps): Promise<RunPluginResponse> => {
  const {
    node: { pluginId },
    runningAppInfo,
    mode,
    params: data // Plugin input
  } = props;

  if (!pluginId) {
    return Promise.reject('pluginId can not find');
  }

  // auth plugin
  const pluginData = await authPluginByTmbId({
    appId: pluginId,
    tmbId: runningAppInfo.tmbId,
    per: ReadPermissionVal
  });

  const plugin = await getPluginRuntimeById(pluginId);

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
  const runtimeVariables = {
    ...filterSystemVariables(props.variables),
    appId: String(plugin.id)
  };

  const { flowResponses, flowUsages, assistantResponses, runTimes } = await dispatchWorkFlow({
    ...props,
    runningAppInfo: {
      id: String(plugin.id),
      teamId: plugin.teamId || '',
      tmbId: pluginData?.tmbId || ''
    },
    variables: runtimeVariables,
    query: getPluginRunUserQuery(plugin.nodes, runtimeVariables).value,
    chatConfig: {},
    runtimeNodes,
    runtimeEdges: initWorkflowEdgeStatus(plugin.edges)
  });

  const output = flowResponses.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);

  if (output) {
    output.moduleLogo = plugin.avatar;
  }

  const isError = !!output?.pluginOutput?.error;
  const usagePoints = isError ? 0 : await computedPluginUsage(plugin, flowUsages);

  return {
    assistantResponses,
    // responseData, // debug
    [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: plugin.avatar,
      totalPoints: usagePoints,
      pluginOutput: output?.pluginOutput,
      pluginDetail:
        mode === 'test' && plugin.teamId === runningAppInfo.teamId
          ? flowResponses.filter((item) => {
              const filterArr = [FlowNodeTypeEnum.pluginOutput];
              return !filterArr.includes(item.moduleType as any);
            })
          : undefined
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: plugin.name,
        totalPoints: usagePoints,
        tokens: 0
      }
    ],
    [DispatchNodeResponseKeyEnum.toolResponses]: output?.pluginOutput ? output.pluginOutput : {},
    ...(output ? output.pluginOutput : {})
  };
};
