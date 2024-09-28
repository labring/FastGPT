import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';

export type Props = ModuleDispatchProps<{}>;
export type Response = DispatchNodeResultType<{}>;

export const dispatchToolParams = (props: Props): Response => {
  const { node } = props;
  const { inputs } = node;
  const toolParamsResult = inputs.reduce<Record<string, any>>((acc, cur) => {
    acc[cur.key] = cur.value;
    return acc;
  }, {});
  return {
    ...toolParamsResult,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      toolParamsResult
    }
  };
};
