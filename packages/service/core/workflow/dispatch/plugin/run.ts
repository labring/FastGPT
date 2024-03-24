import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { dispatchWorkFlow } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { DYNAMIC_INPUT_KEY, ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/module/runtime/constants';
import { getPluginRuntimeById } from '../../../plugin/controller';
import { authPluginCanUse } from '../../../../support/permission/auth/plugin';
import { setEntryEntries } from '../utils';
import { DispatchNodeResultType } from '@fastgpt/global/core/module/runtime/type';

type RunPluginProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.pluginId]: string;
  [key: string]: any;
}>;
type RunPluginResponse = DispatchNodeResultType<{}>;

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

  await authPluginCanUse({ id: pluginId, teamId, tmbId });
  const plugin = await getPluginRuntimeById(pluginId);

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

  const { flowResponses, flowUsages, assistantResponses } = await dispatchWorkFlow({
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
