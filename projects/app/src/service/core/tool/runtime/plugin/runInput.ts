import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';

export type PluginInputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;

export const dispatchPluginInput = (props: PluginInputProps) => {
  const { inputs } = props;

  return inputs;
};
