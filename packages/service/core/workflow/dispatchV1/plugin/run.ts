// @ts-nocheck

import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';
import { dispatchWorkFlowV1 } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { splitCombinePluginId } from '../../../app/plugin/controller';
import { setEntryEntries, DYNAMIC_INPUT_KEY } from '../utils';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { PluginRuntimeType, PluginTemplateType } from '@fastgpt/global/core/plugin/type';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { MongoPlugin } from '../../../plugin/schema';

type RunPluginProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.pluginId]: string;
  [key: string]: any;
}>;
type RunPluginResponse = DispatchNodeResultType<{}>;

const getPluginTemplateById = async (id: string): Promise<PluginTemplateType> => {
  const { source, pluginId } = await splitCombinePluginId(id);
  if (source === PluginSourceEnum.community) {
    const item = global.communityPluginsV1?.find((plugin) => plugin.id === pluginId);

    if (!item) return Promise.reject('plugin not found');

    return item;
  }
  if (source === PluginSourceEnum.personal) {
    const item = await MongoPlugin.findById(id).lean();
    if (!item) return Promise.reject('plugin not found');
    return {
      id: String(item._id),
      teamId: String(item.teamId),
      name: item.name,
      avatar: item.avatar,
      intro: item.intro,
      showStatus: true,
      source: PluginSourceEnum.personal,
      modules: item.modules,
      templateType: FlowNodeTemplateTypeEnum.personalPlugin
    };
  }
  return Promise.reject('plugin not found');
};

const getPluginRuntimeById = async (id: string): Promise<PluginRuntimeType> => {
  const plugin = await getPluginTemplateById(id);

  return {
    teamId: plugin.teamId,
    name: plugin.name,
    avatar: plugin.avatar,
    showStatus: plugin.showStatus,
    modules: plugin.modules
  };
};

export const dispatchRunPlugin = async (props: RunPluginProps): Promise<RunPluginResponse> => {
  const {
    mode,
    teamId,
    tmbId,
    params: { pluginId, ...data }
  } = props;

  if (!pluginId) {
    return Promise.reject('pluginId can not find');
  }

  const plugin = await getPluginRuntimeById(pluginId);
  if (plugin.teamId && plugin.teamId !== teamId) {
    return Promise.reject('plugin not found');
  }

  // concat dynamic inputs
  const inputModule = plugin.modules.find((item) => item.flowType === FlowNodeTypeEnum.pluginInput);
  if (!inputModule) return Promise.reject('Plugin error, It has no set input.');
  const hasDynamicInput = inputModule.inputs.find((input) => input.key === DYNAMIC_INPUT_KEY);

  const startParams: Record<string, any> = (() => {
    if (!hasDynamicInput) return data;

    const params: Record<string, any> = {
      [DYNAMIC_INPUT_KEY]: {}
    };

    for (const key in data) {
      const input = inputModule.inputs.find((input) => input.key === key);
      if (input) {
        params[key] = data[key];
      } else {
        params[DYNAMIC_INPUT_KEY][key] = data[key];
      }
    }

    return params;
  })();

  const { flowResponses, flowUsages, assistantResponses } = await dispatchWorkFlowV1({
    ...props,
    modules: setEntryEntries(plugin.modules).map((module) => ({
      ...module,
      showStatus: false
    })),
    runtimeModules: undefined, // must reset
    startParams
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
