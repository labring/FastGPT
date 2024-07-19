import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { dispatchWorkFlow } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getPluginRuntimeById } from '../../../app/plugin/controller';
import {
  getDefaultEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { updateToolInputValue } from '../agent/runTool/utils';
import { authPluginByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { computedPluginUsage } from '../../../app/plugin/utils';

type RunPluginProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
type RunPluginResponse = DispatchNodeResultType<{}>;

export const dispatchRunPlugin = async (props: RunPluginProps): Promise<RunPluginResponse> => {
  const {
    node: { pluginId },
    app: workflowApp,
    mode,
    teamId,
    params: data
  } = props;

  if (!pluginId) {
    return Promise.reject('pluginId can not find');
  }

  // auth plugin
  await authPluginByTmbId({
    appId: pluginId,
    tmbId: workflowApp.tmbId,
    per: ReadPermissionVal
  });

  const plugin = await getPluginRuntimeById(pluginId);

  // concat dynamic inputs
  const inputModule = plugin.nodes.find(
    (item) => item.flowNodeType === FlowNodeTypeEnum.pluginInput
  );
  if (!inputModule) return Promise.reject('Plugin error, It has no set input.');

  const { flowResponses, flowUsages, assistantResponses } = await dispatchWorkFlow({
    ...props,
    runtimeNodes: storeNodes2RuntimeNodes(plugin.nodes, getDefaultEntryNodeIds(plugin.nodes)).map(
      (node) => {
        if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
          return {
            ...node,
            showStatus: false,
            inputs: updateToolInputValue({
              inputs: node.inputs,
              params: data
            })
          };
        }
        return {
          ...node,
          showStatus: false
        };
      }
    ),
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
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: plugin.avatar,
      totalPoints: usagePoints,
      pluginOutput: output?.pluginOutput,
      pluginDetail:
        mode === 'test' && plugin.teamId === teamId
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
