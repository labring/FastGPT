import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type/index.d';
import { dispatchWorkFlow } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getPluginRuntimeById, splitCombinePluginId } from '../../../app/plugin/controller';
import {
  getDefaultEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { updateToolInputValue } from '../agent/runTool/utils';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { authAppByTmbId } from '../../../../support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';

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
  const { source } = await splitCombinePluginId(pluginId);
  if (source === PluginSourceEnum.personal) {
    await authAppByTmbId({
      appId: pluginId,
      tmbId: workflowApp.tmbId,
      per: ReadPermissionVal
    });
  }
  const plugin = await getPluginRuntimeById(pluginId);

  // concat dynamic inputs
  const inputModule = plugin.nodes.find(
    (item) => item.flowNodeType === FlowNodeTypeEnum.pluginInput
  );
  if (!inputModule) return Promise.reject('Plugin error, It has no set input.');
  const hasDynamicInput = inputModule.inputs.find(
    (input) => input.key === NodeInputKeyEnum.addInputParam
  );

  const startParams: Record<string, any> = (() => {
    if (!hasDynamicInput) return data;

    const params: Record<string, any> = {
      [NodeInputKeyEnum.addInputParam]: {}
    };

    for (const key in data) {
      if (key === NodeInputKeyEnum.addInputParam) continue;

      const input = inputModule.inputs.find((input) => input.key === key);
      if (input) {
        params[key] = data[key];
      } else {
        params[NodeInputKeyEnum.addInputParam][key] = data[key];
      }
    }

    return params;
  })();

  // replace input by dynamic variables
  if (hasDynamicInput) {
    for (const key in startParams) {
      if (key === NodeInputKeyEnum.addInputParam) continue;
      startParams[key] = replaceVariable(
        startParams[key],
        startParams[NodeInputKeyEnum.addInputParam]
      );
    }
  }

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
              params: startParams
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

  return {
    assistantResponses,
    // responseData, // debug
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      moduleLogo: plugin.avatar,
      totalPoints: flowResponses.reduce((sum, item) => sum + (item.totalPoints || 0), 0),
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
        totalPoints: flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0),
        model: plugin.name,
        tokens: 0
      }
    ],
    [DispatchNodeResponseKeyEnum.toolResponses]: output?.pluginOutput ? output.pluginOutput : {},
    ...(output ? output.pluginOutput : {})
  };
};
