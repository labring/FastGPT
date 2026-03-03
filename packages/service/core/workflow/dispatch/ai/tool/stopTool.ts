import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';

export type AnswerProps = ModuleDispatchProps<{}>;
export type AnswerResponse = DispatchNodeResultType<{}>;

export const dispatchStopToolCall = (props: Record<string, any>): AnswerResponse => {
  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      toolStop: true
    }
  };
};
