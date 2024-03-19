import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/module/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { DispatchNodeResultType } from '@fastgpt/global/core/module/runtime/type';

export type AnswerProps = ModuleDispatchProps<{}>;
export type AnswerResponse = DispatchNodeResultType<{}>;

export const dispatchStopToolCall = (props: Record<string, any>): AnswerResponse => {
  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      toolStop: true
    }
  };
};
