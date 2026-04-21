import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

type Props = ModuleDispatchProps<Record<string, never>>;
type Response = DispatchNodeResultType<Record<string, never>>;

/**
 * Pure signal node. Runs to completion (leaving a trace in flowResponses) and
 * produces no output. loopRun reads this trace via isLoopBreakHit() to decide
 * whether to enter the next iteration.
 */
export const dispatchLoopRunBreak = async (_props: Props): Promise<Response> => {
  return {
    data: {},
    [DispatchNodeResponseKeyEnum.nodeResponse]: {}
  };
};
