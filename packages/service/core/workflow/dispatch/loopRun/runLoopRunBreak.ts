import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

type Props = ModuleDispatchProps<Record<string, never>>;
type Response = DispatchNodeResultType<Record<string, never>>;

// Signal-only node. The parent loopRun detects the moduleType in flowResponses
// to decide whether to terminate the loop.
export const dispatchLoopRunBreak = async (_props: Props): Promise<Response> => {
  return {
    data: {},
    [DispatchNodeResponseKeyEnum.nodeResponse]: {}
  };
};
