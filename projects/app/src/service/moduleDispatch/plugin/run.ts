import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { dispatchModules } from '../index';
import {
  FlowNodeSpecialInputKeyEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/module/node/constant';
import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import { TaskResponseKeyEnum } from '@fastgpt/global/core/chat/constants';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';

type RunPluginProps = ModuleDispatchProps<{
  [FlowNodeSpecialInputKeyEnum.pluginId]: string;
  [key: string]: any;
}>;
type RunPluginResponse = {
  answerText: string;
  [TaskResponseKeyEnum.responseData]?: moduleDispatchResType[];
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
    // [TaskResponseKeyEnum.responseData]: output,
    [TaskResponseKeyEnum.responseData]: responseData.filter(
      (item) => item.moduleType !== FlowNodeTypeEnum.pluginOutput
    ),
    ...(output ? output.pluginOutput : {})
  };
};
