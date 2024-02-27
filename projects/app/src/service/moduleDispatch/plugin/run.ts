import type {
  ModuleDispatchProps,
  ModuleDispatchResponse
} from '@fastgpt/global/core/module/type.d';
import { dispatchModules } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import {
  DYNAMIC_INPUT_KEY,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum
} from '@fastgpt/global/core/module/constants';
import { getPluginRuntimeById } from '@fastgpt/service/core/plugin/controller';
import { authPluginCanUse } from '@fastgpt/service/support/permission/auth/plugin';

type RunPluginProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.pluginId]: string;
  [key: string]: any;
}>;
type RunPluginResponse = ModuleDispatchResponse<{
  [ModuleOutputKeyEnum.answerText]: string;
}>;

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

  const { responseData, moduleDispatchBills, answerText } = await dispatchModules({
    ...props,
    modules: plugin.modules.map((module) => ({
      ...module,
      showStatus: false
    })),
    startParams
  });

  const output = responseData.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);

  if (output) {
    output.moduleLogo = plugin.avatar;
  }

  return {
    answerText,
    // responseData, // debug
    [ModuleOutputKeyEnum.responseData]: {
      moduleLogo: plugin.avatar,
      totalPoints: responseData.reduce((sum, item) => sum + (item.totalPoints || 0), 0),
      runningTime: responseData.reduce((sum, item) => sum + (item.runningTime || 0), 0),
      pluginOutput: output?.pluginOutput,
      pluginDetail:
        mode === 'test' && plugin.teamId === teamId
          ? responseData.filter((item) => {
              const filterArr = [FlowNodeTypeEnum.pluginOutput];
              return !filterArr.includes(item.moduleType as any);
            })
          : undefined
    },
    [ModuleOutputKeyEnum.moduleDispatchBills]: [
      {
        moduleName: plugin.name,
        totalPoints: moduleDispatchBills.reduce((sum, item) => sum + (item.totalPoints || 0), 0),
        model: plugin.name,
        charsLength: 0
      }
    ],
    ...(output ? output.pluginOutput : {})
  };
};
