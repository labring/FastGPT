import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { dispatchModules } from '../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';

type RunPluginProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.pluginId]: string;
  [key: string]: any;
}>;
type RunPluginResponse = {
  [ModuleOutputKeyEnum.answerText]: string;
  [ModuleOutputKeyEnum.responseData]?: moduleDispatchResType[];
};

export const dispatchRunPlugin = async (props: RunPluginProps): Promise<RunPluginResponse> => {
  const {
    inputs: { pluginId, ...data }
  } = props;

  if (!pluginId) {
    return Promise.reject('Input is empty');
  }

  const plugin = await MongoPlugin.findOne({ _id: pluginId });
  if (!plugin) {
    return Promise.reject('Plugin not found');
  }

  const { responseData, answerText } = await dispatchModules({
    ...props,
    modules: plugin.modules,
    params: data
  });

  const output = responseData.find((item) => item.moduleType === FlowNodeTypeEnum.pluginOutput);

  if (output) {
    output.moduleLogo = plugin.avatar;
  }

  return {
    answerText,
    responseData: responseData.filter((item) => item.moduleType !== FlowNodeTypeEnum.pluginOutput),
    ...(output ? output.pluginOutput : {})
  };
};
