import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

export type PluginOutputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
export type PluginOutputResponse = {
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
};

export const dispatchPluginOutput = (props: PluginOutputProps): PluginOutputResponse => {
  const { inputs } = props;

  return {
    responseData: {
      price: 0,
      pluginOutput: inputs
    }
  };
};
