import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';

type Response = DispatchNodeResultType<Record<string, never>>;

// Signal-only node. The workflow runtime records its moduleType into
// runtimeNodeResponseSummary so the parent loopRun can terminate the loop.
export const dispatchLoopRunBreak = async (): Promise<Response> => {
  return {
    data: {},
    [DispatchNodeResponseKeyEnum.nodeResponse]: {}
  };
};
