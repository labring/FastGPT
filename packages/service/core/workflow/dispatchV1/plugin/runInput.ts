import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';

export type PluginInputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;

export const dispatchPluginInput = (props: PluginInputProps) => {
  const { params } = props;

  return params;
};
