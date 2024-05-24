import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type/index.d';

export type PluginInputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;

export const dispatchPluginInput = (props: PluginInputProps) => {
  const { params } = props;

  return params;
};
