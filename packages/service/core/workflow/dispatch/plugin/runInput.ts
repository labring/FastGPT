import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';

export type PluginInputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;

export const dispatchPluginInput = (props: PluginInputProps) => {
  const { params, query } = props;
  const { files } = chatValue2RuntimePrompt(query);

  return {
    ...params,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {},
    [NodeOutputKeyEnum.userFiles]: files
      .map((item) => {
        return item?.url ?? '';
      })
      .filter(Boolean)
  };
};
