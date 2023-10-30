import type { ModuleDispatchProps } from '@/types/core/chat/type';

export type PluginInputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;

export const dispatchPluginInput = (props: PluginInputProps) => {
  const { inputs } = props;

  return inputs;
};
