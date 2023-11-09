import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import { TaskResponseKeyEnum } from '@fastgpt/global/core/chat/constants';
import type { ModuleDispatchProps } from '@/types/core/chat/type';

export type PluginOutputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
export type PluginOutputResponse = {
  [TaskResponseKeyEnum.responseData]: moduleDispatchResType;
};

export const dispatchPluginOutput = (props: PluginOutputProps): PluginOutputResponse => {
  const { inputs } = props;

  return {
    [TaskResponseKeyEnum.responseData]: {
      price: 0,
      pluginOutput: inputs
    }
  };
};
