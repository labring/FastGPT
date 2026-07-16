import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

export type PluginOutputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
export type PluginOutputResponse = DispatchNodeResultType<Record<string, any>>;

export const dispatchPluginOutput = (props: PluginOutputProps): PluginOutputResponse => {
  const { params } = props;

  return {
    [DispatchNodeResponseKeyEnum.toolResponse]: params,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      pluginOutput: params
    }
  };
};
