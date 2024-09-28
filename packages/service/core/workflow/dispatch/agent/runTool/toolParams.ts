import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';

export type Props = ModuleDispatchProps<{}>;
export type Response = DispatchNodeResultType<{}>;

export const dispatchToolParams = (props: Props): Response => {
  const { params } = props;

  return {
    ...params,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      toolParamsResult: params
    }
  };
};
