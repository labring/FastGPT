import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type.d';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

export type PluginOutputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
export type PluginOutputResponse = DispatchNodeResultType<{}>;

export const dispatchPluginOutput = (props: PluginOutputProps): PluginOutputResponse => {
  const { params } = props;

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0,
      pluginOutput: params
    }
  };
};
