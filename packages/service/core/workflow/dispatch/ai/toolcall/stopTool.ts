import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';

export type AnswerProps = ModuleDispatchProps<Record<string, never>>;
export type AnswerResponse = DispatchNodeResultType<Record<string, never>>;

// Signal-only tool node. The parent ToolCall workflow reads toolStop from nodeResponse
// and stops the current agent loop without treating it as an execution error.
export const dispatchStopToolCall = (): AnswerResponse => {
  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      toolStop: true
    }
  };
};
