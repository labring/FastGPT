import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { dispatchModules } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import { getPluginRuntimeById } from '@fastgpt/service/core/plugin/controller';
import { authPluginCanUse } from '@fastgpt/service/support/permission/auth/plugin';

type RunPluginProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.pluginId]: string;
  [key: string]: any;
}>;
type RunPluginResponse = {
  [ModuleOutputKeyEnum.answerText]: string;
  [ModuleOutputKeyEnum.responseData]?: moduleDispatchResType;
};

export const dispatchRunPlugin = async (props: RunPluginProps): Promise<RunPluginResponse> => {
  const {
    teamId,
    tmbId,
    inputs: { pluginId, ...data }
  } = props;

  if (!pluginId) {
    return Promise.reject('Input is empty');
  }

  await authPluginCanUse({ id: pluginId, teamId, tmbId });
  const plugin = await getPluginRuntimeById(pluginId);

  const { responseData, answerText } = await dispatchModules({
    ...props,
    modules: plugin.modules.map((module) => ({
      ...module,
      showStatus: false
    })),
    params: data
  });

  const output = responseData.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);

  if (output) {
    output.moduleLogo = plugin.avatar;
  }

  return {
    answerText,
    responseData: {
      moduleLogo: plugin.avatar,
      price: responseData.reduce((sum, item) => sum + item.price, 0),
      runningTime: responseData.reduce((sum, item) => sum + (item.runningTime || 0), 0),
      pluginOutput: output?.pluginOutput
    },
    ...(output ? output.pluginOutput : {})
  };
};
